"""Claim management service: list / detail / approve / cancel / edit.

See Attachment 2 §3.4 for the endpoint contract.

Design notes:
- list_claims mirrors notifications.py's compound-cursor pagination — sort by
  updated_at DESC, _id DESC, with a $or predicate that does not silently drop
  docs sharing the boundary timestamp. updated_at is always set by
  MongoDBClient.upsert, so it is reliable as a sort key in practice even
  though the schema marks it Optional.
- Ownership mismatches return 404, never 403. Same convention as
  notifications.py:ack_notification — avoids leaking existence to a user who
  guessed the right UUID.
- Approve / cancel / edit all touch the Claim.draft_content vs
  draft_versions[-1].content invariant (enforced by @model_validator). Any
  mutation routes through model_dump → modify → model_validate so the
  invariant is re-checked before the write. Mutating instance attributes
  alone would silently bypass the validator since BaseDocument instances are
  trusted by db.upsert.
- claim.approved Pub/Sub payload uses a fresh event_id (uuid4) per publish.
  The downstream claim-agent's subscription is at-least-once; event_id is
  the dedup key for any idempotent handlers.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from claimit_mongodb_models import Claim, MongoDBClient
from claimit_mongodb_models.enums import (
    ClaimOutcome,
    DraftGeneratedBy,
    Platform,
    SendMode,
)

from ..middleware.errors import ApiError
from ..middleware.pagination import decode_cursor, encode_cursor
from .pubsub_publisher import PubSubPublisher

logger = logging.getLogger(__name__)

CLAIM_APPROVED_TOPIC = "claim.approved"
_AUTO_SEND_CANCEL_WINDOW = timedelta(minutes=5)


async def list_claims(
    db: MongoDBClient,
    user_id: UUID,
    outcome: ClaimOutcome | None = None,
    platform: Platform | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, object]:
    """List the authenticated user's claims with optional filters.

    Returns:
        {
          "claims": list[dict],          # Claim docs as JSON
          "next_cursor": str | None,
        }
    """
    match: dict[str, Any] = {"user_id": user_id}
    if outcome is not None:
        match["outcome"] = outcome.value
    if platform is not None:
        match["platform"] = platform.value

    if cursor is not None:
        cursor_id_str, sort_key = decode_cursor(cursor)
        if sort_key is None:
            raise ApiError("invalid_cursor", "Cursor is missing the sort key", status_code=400)
        try:
            cursor_uuid = UUID(cursor_id_str)
        except ValueError as err:
            raise ApiError("invalid_cursor", "Cursor contains invalid ID", status_code=400) from err
        try:
            sort_dt = datetime.fromisoformat(sort_key)
        except ValueError as err:
            raise ApiError(
                "invalid_cursor", "Cursor contains invalid timestamp", status_code=400
            ) from err
        match["$or"] = [
            {"updated_at": {"$lt": sort_dt}},
            {"updated_at": sort_dt, "_id": {"$lt": cursor_uuid}},
        ]

    pipeline = [
        {"$match": match},
        {"$sort": {"updated_at": -1, "_id": -1}},
        {"$limit": limit + 1},
    ]
    raw_docs = await db.aggregate("claims", pipeline)

    has_more = len(raw_docs) > limit
    visible = raw_docs[:limit]

    next_cursor: str | None = None
    if has_more:
        last = visible[-1]
        last_updated = last.get("updated_at")
        if isinstance(last_updated, datetime):
            sort_key_out = last_updated.isoformat()
        else:
            sort_key_out = str(last_updated)
        next_cursor = encode_cursor(doc_id=str(last["_id"]), sort_key=sort_key_out)

    claims = [Claim.model_validate(d).model_dump(mode="json", by_alias=True) for d in visible]
    return {"claims": claims, "next_cursor": next_cursor}


async def get_claim_detail(
    db: MongoDBClient,
    user_id: UUID,
    claim_id: UUID,
) -> dict[str, object]:
    """Return a claim with its linked purchase + policy.

    404s on missing claim or ownership mismatch.
    """
    claim = await _load_owned_claim(db, claim_id, user_id)

    # Parallelize the two follow-up reads — both are user-scoped reads with no
    # cross-dependency, so a single round-trip-of-two saves one network RTT.
    purchase, policy = await asyncio.gather(
        db.get_purchase(claim.purchase_id),
        db.get_policy(claim.platform.value),
    )

    return {
        "claim": claim.model_dump(mode="json", by_alias=True),
        "purchase": purchase.model_dump(mode="json", by_alias=True) if purchase else None,
        "policy": policy.model_dump(mode="json", by_alias=True) if policy else None,
        "evidence_url": claim.evidence_screenshot_url,
    }


async def approve_claim(
    db: MongoDBClient,
    publisher: PubSubPublisher,
    user_id: UUID,
    claim_id: UUID,
    send_override: SendMode | None = None,
    edited_draft_content: str | None = None,
) -> dict[str, object]:
    """Approve a draft claim — transitions outcome draft_pending → pending and
    publishes claim.approved for the claim-agent to actually submit.

    409 if the claim is not in DRAFT_PENDING state.
    """
    claim = await _load_owned_claim(db, claim_id, user_id)
    if claim.outcome != ClaimOutcome.DRAFT_PENDING:
        raise ApiError(
            "claim_not_approvable",
            f"Claim cannot be approved in state {claim.outcome.value!r}",
            status_code=409,
        )

    now = datetime.now(UTC)
    claim_dict = claim.model_dump(by_alias=True)

    if edited_draft_content is not None:
        new_version_no = len(claim.draft_versions) + 1
        claim_dict["draft_versions"].append(
            {
                "version": new_version_no,
                "content": edited_draft_content,
                "generated_by": DraftGeneratedBy.USER_EDIT.value,
                "at": now,
            }
        )
        claim_dict["draft_content"] = edited_draft_content

    claim_dict["send_override"] = send_override.value if send_override is not None else None
    claim_dict["submitted_at"] = now
    claim_dict["outcome"] = ClaimOutcome.PENDING.value
    # submitted_via stays None — set later by claim-agent when the message
    # actually goes out via Gmail / SendGrid / clipboard.

    updated = Claim.model_validate(claim_dict)
    await db.upsert_claim(updated)

    event_payload = {
        "event_id": str(uuid4()),
        "claim_id": str(updated.id),
        "user_id": str(updated.user_id),
        "purchase_id": str(updated.purchase_id),
        "platform": updated.platform.value,
        "claim_type": updated.claim_type.value,
        "claim_amount": updated.claim_amount,
        "currency": updated.currency,
        "draft_content": updated.draft_content,
        "send_override": updated.send_override.value if updated.send_override else None,
        "approved_at": now.isoformat(),
    }
    try:
        await publisher.publish(CLAIM_APPROVED_TOPIC, event_payload)
    except Exception:
        # Persist already moved the claim to PENDING but the broker didn't
        # accept the wake-up message. If we leave it at PENDING, a client
        # retry hits the state gate (claim_not_approvable) — the user gets
        # stuck. Roll the outcome back to DRAFT_PENDING and clear the
        # submission stamp so retry is well-defined.
        logger.exception(
            "Failed to publish claim.approved for claim %s; rolling back outcome", updated.id
        )
        try:
            await db.partial_update(
                "claims",
                updated.id,
                {
                    "outcome": ClaimOutcome.DRAFT_PENDING.value,
                    "submitted_at": None,
                },
                model=Claim,
            )
        except Exception:
            # Rollback itself failed — claim is now stranded in PENDING with
            # no downstream notification. Operator intervention required;
            # log so on-call can find it.
            logger.exception(
                "Rollback failed after publish failure for claim %s; manual fix required",
                updated.id,
            )
        raise ApiError(
            "publish_failed",
            "Claim approval failed; please retry.",
            status_code=502,
        ) from None

    return {
        "claim_id": str(updated.id),
        "submitted_at": now.isoformat(),
        "submitted_via": updated.submitted_via.value if updated.submitted_via else None,
    }


async def cancel_claim(
    db: MongoDBClient,
    user_id: UUID,
    claim_id: UUID,
    reason: str | None = None,
) -> dict[str, object]:
    """Cancel a claim. Allowed only if not yet submitted, OR within the
    5-minute auto-send hold window (claim-agent honors auto_send_delay_seconds
    before actually sending, so a recent PENDING in auto mode is still
    cancellable).

    409 if the claim is past the cancellation window.
    """
    claim = await _load_owned_claim(db, claim_id, user_id)

    now = datetime.now(UTC)
    # The 5-min cancel window is the auto-send hold buffer — claim-agent
    # delays auto-mode sends by auto_send_delay_seconds before actually
    # dispatching. Approval-mode claims have no such buffer; once they're
    # PENDING they're considered queued for human-initiated send, so cancel
    # after submission isn't safe.
    within_auto_window = (
        claim.outcome == ClaimOutcome.PENDING
        and claim.send_override == SendMode.AUTO
        and claim.submitted_at is not None
        and _to_utc(claim.submitted_at) is not None
        and (now - _to_utc(claim.submitted_at)) < _AUTO_SEND_CANCEL_WINDOW
    )
    is_cancellable = claim.outcome == ClaimOutcome.DRAFT_PENDING or within_auto_window
    if not is_cancellable:
        raise ApiError(
            "claim_not_cancellable",
            f"Claim cannot be cancelled in state {claim.outcome.value!r}",
            status_code=409,
        )

    success = await db.partial_update(
        "claims",
        claim_id,
        {
            "outcome": ClaimOutcome.USER_CANCELLED.value,
            "outcome_note": reason,
            "resolved_at": now,
        },
        model=Claim,
    )
    if not success:
        # Document deleted between read and write. Race; treat as 404.
        raise ApiError("claim_not_found", "Claim not found", status_code=404)
    return {"success": True}


async def edit_claim_draft(
    db: MongoDBClient,
    user_id: UUID,
    claim_id: UUID,
    draft_content: str,
) -> dict[str, object]:
    """Append a user-edited DraftVersion and update draft_content in sync.

    409 if the claim is not in DRAFT_PENDING state — editing a submitted claim
    would silently invalidate what was already sent to the merchant.
    """
    claim = await _load_owned_claim(db, claim_id, user_id)
    if claim.outcome != ClaimOutcome.DRAFT_PENDING:
        raise ApiError(
            "claim_not_editable",
            f"Claim cannot be edited in state {claim.outcome.value!r}",
            status_code=409,
        )

    now = datetime.now(UTC)
    new_version_no = len(claim.draft_versions) + 1

    claim_dict = claim.model_dump(by_alias=True)
    claim_dict["draft_versions"].append(
        {
            "version": new_version_no,
            "content": draft_content,
            "generated_by": DraftGeneratedBy.USER_EDIT.value,
            "at": now,
        }
    )
    claim_dict["draft_content"] = draft_content

    # Re-validate so the @model_validator(after) enforces the
    # draft_content == draft_versions[-1].content invariant before the write.
    updated = Claim.model_validate(claim_dict)
    await db.upsert_claim(updated)
    return {"claim": updated.model_dump(mode="json", by_alias=True)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _load_owned_claim(
    db: MongoDBClient,
    claim_id: UUID,
    user_id: UUID,
) -> Claim:
    """Return the claim if it exists AND belongs to user_id; 404 otherwise."""
    claim = await db.find_one("claims", {"_id": claim_id, "user_id": user_id}, Claim)
    if claim is None:
        raise ApiError("claim_not_found", "Claim not found", status_code=404)
    return claim


def _to_utc(dt: datetime) -> datetime:
    """Coerce a possibly-naive datetime to UTC for safe comparison with now()."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


__all__ = [
    "approve_claim",
    "cancel_claim",
    "edit_claim_draft",
    "get_claim_detail",
    "list_claims",
]
