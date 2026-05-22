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
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from claimit_mongodb_models import (
    Claim,
    ClaimReadTolerant,
    DraftVersion,
    MongoDBClient,
    PriceHistoryReadTolerant,
)
from claimit_mongodb_models.enums import (
    ClaimOutcome,
    DraftGeneratedBy,
    NotificationEntityType,
    NotificationEventType,
    Platform,
    SendMode,
)
from claimit_mongodb_models.notification_helpers import write_notification_event
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..middleware.errors import ApiError
from ..middleware.pagination import decode_cursor, encode_cursor
from .evidence_storage import EvidenceObjectMissingError, EvidenceReader
from .pubsub_publisher import PubSubPublisher

logger = logging.getLogger(__name__)

CLAIM_APPROVED_TOPIC = "claim.approved"
_AUTO_SEND_CANCEL_WINDOW = timedelta(minutes=5)

# UI-facing groupings for the /claims filter chips. Each group maps to a set
# of ClaimOutcome values that the chip should surface. The mapping is
# deliberately defined here (not in enums.py) because this is a presentation
# concern owned by the list endpoint, not part of the canonical schema.
STATUS_GROUP_OUTCOMES: dict[str, list[ClaimOutcome]] = {
    "pending": [ClaimOutcome.DRAFT_PENDING],
    "in_progress": [ClaimOutcome.PENDING],
    "resolved": [
        ClaimOutcome.APPROVED,
        ClaimOutcome.DENIED,
        ClaimOutcome.EXPIRED,
        ClaimOutcome.USER_SELF_SERVICE,
        ClaimOutcome.USER_CANCELLED,
        ClaimOutcome.NO_RESPONSE,
    ],
}

# Search input cap — keeps regex compilation bounded and avoids accidental
# query-string DOS. The route layer enforces this cap so a too-long `q` is
# rejected at the API edge before it reaches the service.
Q_MAX_LENGTH = 100


# ---------------------------------------------------------------------------
# Shared aggregation building blocks for `claims` reads.
#
# `list_claims` (full /claims list) and `list_claims_for_purchase` (the
# enriched purchase-detail bundle, ticket 5.6) BOTH need to emit the same
# `ClaimListItem`-shaped row — Claim core fields plus the three joined
# Purchase fields (`product_name`, `category`, `window_expires`). Defining
# the lookup/unwind/project stages once here keeps the two endpoints in
# lockstep: a future tweak to the projection (added/removed/renamed
# field) lands in one place, not two.
#
# `_CLAIMS_PURCHASE_LOOKUP_STAGE` uses a sub-pipeline to project only the
# three needed Purchase fields. Keeps the joined sub-doc small (purchases
# carry receipt blobs and extraction metadata that the list view doesn't
# render). `_CLAIMS_PURCHASE_UNWIND_STAGE` preserves orphan claims — when
# the linked Purchase is missing/deleted, the joined fields project to
# `None` rather than the claim disappearing from results.
# ---------------------------------------------------------------------------

_CLAIMS_PURCHASE_LOOKUP_STAGE: dict[str, Any] = {
    "$lookup": {
        "from": "purchases",
        "localField": "purchase_id",
        "foreignField": "_id",
        "as": "purchase",
        "pipeline": [
            {
                "$project": {
                    "_id": 0,
                    "product_name": 1,
                    "category": 1,
                    "window_expires": 1,
                }
            }
        ],
    }
}

_CLAIMS_PURCHASE_UNWIND_STAGE: dict[str, Any] = {
    "$unwind": {"path": "$purchase", "preserveNullAndEmptyArrays": True}
}

# Final `$project` stage — whitelist projection whose output shape matches
# `ClaimListItem`. Heavy fields (`draft_content`, `draft_versions`,
# `policy_clause_cited`, `outcome_note`, etc.) are intentionally NOT in
# this projection — the detail endpoint exposes them.
_CLAIM_LIST_PROJECT_STAGE: dict[str, Any] = {
    "$project": {
        "_id": 1,
        "updated_at": 1,
        "purchase_id": 1,
        "user_id": 1,
        "platform": 1,
        "claim_amount": 1,
        "currency": 1,
        "claim_type": 1,
        "outcome": 1,
        "submitted_at": 1,
        "resolved_at": 1,
        "redraft_count": 1,
        "product_name": "$purchase.product_name",
        "category": "$purchase.category",
        "window_expires": "$purchase.window_expires",
    }
}


class ClaimListItem(BaseModel):
    """Enriched list-row shape returned by GET /api/v1/claims.

    Claim core fields plus three fields joined from the linked Purchase via
    `$lookup`: `product_name`, `category`, `window_expires`. The joined
    fields are Optional because the list endpoint preserves orphan claims
    (claim whose Purchase has been deleted or never existed) so they can
    still be surfaced and managed; in that case the joined fields are
    `None`.

    Heavy fields from the Claim document (`draft_content`, `draft_versions`,
    `policy_clause_cited`, `outcome_note`, etc.) are intentionally dropped
    from the list response — the detail endpoint exposes the full Claim.

    Read-tolerant by design: `platform` / `claim_type` / `outcome` /
    `category` are widened to `str | None`, and a `model_validator(before)`
    coerces missing/null required scalars to safe defaults so a single
    legacy/degraded doc in the user's history doesn't 500 the entire list
    page. The frontend renders unknown enum values via Title-Case
    fallback labels.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: UUID = Field(alias="_id")
    updated_at: datetime | None = None
    purchase_id: UUID | None = None
    user_id: UUID | None = None
    platform: str | None = None
    claim_amount: float | None = None
    currency: str | None = None
    claim_type: str | None = None
    outcome: str | None = None
    submitted_at: datetime | None = None
    resolved_at: datetime | None = None
    redraft_count: int | None = None

    # Joined from Purchase via $lookup.
    product_name: str | None = None
    category: str | None = None
    window_expires: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_legacy_doc(cls, data: object) -> object:
        """Normalise a raw aggregation row into the tolerant shape.

        The aggregate result preserves enum values as plain strings (Mongo
        stores StrEnum values as strings on the wire), so the only thing
        this validator has to do is leave them alone — we explicitly do
        NOT validate enum membership, NOT enforce numeric bounds, and NOT
        treat null as an error. Pydantic's default per-field validation
        with `T | None` annotations already does the right thing; the
        validator is here as the documented coercion seam in case a
        future schema migration needs to remap legacy values.
        """
        return data


async def list_claims(
    db: MongoDBClient,
    user_id: UUID,
    outcome: ClaimOutcome | None = None,
    status_group: str | None = None,
    platform: Platform | None = None,
    q: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, object]:
    """List the authenticated user's claims, enriched with linked Purchase
    fields, with optional filters and search.

    Pipeline ordering — branched by whether `q` is set:

    - When `q` is None (the common case): claim filters + cursor + sort +
      limit all run BEFORE `$lookup`. The sort keys (`updated_at`, `_id`)
      live on the Claim document, so they don't need the join. This caps
      enrichment work at the page size (~limit + 1) instead of the user's
      whole matched history.

    - When `q` is set: must `$lookup` before the q-filter `$match` so the
      regex can match against the joined `purchase.product_name`. Sort and
      limit run after the q-filter, so cursor pages may come back short
      when `q` is set — `Load more` keys off the last surviving item's
      `(updated_at, _id)`, which stays correct under the skew.

    `preserveNullAndEmptyArrays` keeps orphan claims (claim whose Purchase
    is missing/deleted) visible in the list — their joined fields are
    `None`. Both branches preserve this behavior.

    Filter precedence:
    - `outcome` wins over `status_group`. If both are set, `status_group`
      is silently ignored. This is a deliberate design choice so a UI that
      drives the chips with `status_group` and an admin tool that filters
      by a precise `outcome` can both call the same endpoint without
      collision logic.

    Search semantics:
    - `q` is `re.escape`d before regex construction. User input cannot
      inject regex metacharacters or trigger ReDoS — a stray "(" or "*"
      becomes a literal substring match.
    - `q` matches case-insensitively against `platform` OR
      `purchase.product_name`. An empty/whitespace-only `q` is treated as
      "no filter".

    Returns:
        {
          "claims": list[dict],          # ClaimListItem JSON (by_alias)
          "next_cursor": str | None,
        }
    """
    match: dict[str, Any] = {"user_id": user_id}
    if outcome is not None:
        match["outcome"] = outcome.value
    elif status_group is not None:
        outcomes = STATUS_GROUP_OUTCOMES.get(status_group)
        if outcomes is None:
            raise ApiError(
                "invalid_status_group",
                f"Unknown status_group {status_group!r}; expected one of "
                f"{sorted(STATUS_GROUP_OUTCOMES)}",
                status_code=400,
            )
        match["outcome"] = {"$in": [o.value for o in outcomes]}
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

    # Sort/limit stages are local to this call (limit depends on the
    # caller's page size); the lookup/unwind/project stages are the
    # shared module-level constants so `list_claims_for_purchase` emits
    # an identically-shaped row without duplication.
    sort_stage: dict[str, Any] = {"$sort": {"updated_at": -1, "_id": -1}}
    limit_stage: dict[str, Any] = {"$limit": limit + 1}

    q_clean = q.strip() if q is not None else None
    pipeline: list[dict[str, Any]]
    if q_clean:
        # q path: must $lookup before filtering on joined product_name.
        # Sort/limit run after the q $match so the cursor page reflects
        # post-filter results; this is the same shape as before this
        # commit and the result set is unchanged from the pre-fix code.
        # re.escape makes `q` a literal substring match — no metachar
        # injection, no ReDoS. Mongo's $regex uses Perl-compatible syntax,
        # so Python's re.escape produces a compatible literal pattern.
        pattern = re.escape(q_clean)
        q_match_stage: dict[str, Any] = {
            "$match": {
                "$or": [
                    {"platform": {"$regex": pattern, "$options": "i"}},
                    {"purchase.product_name": {"$regex": pattern, "$options": "i"}},
                ]
            }
        }
        pipeline = [
            {"$match": match},
            _CLAIMS_PURCHASE_LOOKUP_STAGE,
            _CLAIMS_PURCHASE_UNWIND_STAGE,
            q_match_stage,
            sort_stage,
            limit_stage,
            _CLAIM_LIST_PROJECT_STAGE,
        ]
    else:
        # No-q path: sort+limit pre-$lookup so we only enrich the page
        # (~limit+1 claims) instead of the user's whole matched history.
        # Sort keys live on the Claim document so this is semantically
        # identical to the q path's ordering on the same input — verified
        # end-to-end by scripts/validate_claims_lookup.py against Atlas.
        pipeline = [
            {"$match": match},
            sort_stage,
            limit_stage,
            _CLAIMS_PURCHASE_LOOKUP_STAGE,
            _CLAIMS_PURCHASE_UNWIND_STAGE,
            _CLAIM_LIST_PROJECT_STAGE,
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

    items = [
        ClaimListItem.model_validate(d).model_dump(mode="json", by_alias=True) for d in visible
    ]
    return {"claims": items, "next_cursor": next_cursor}


# Hard cap on per-purchase claims surfaced by the enriched detail bundle.
# In normal operation a Purchase has 0-1 active claims; the cap is defensive
# against a runaway redraft loop or a future feature that allows multiple
# concurrent claims per purchase. Detail page just renders a card list - no
# cursor pagination needed.
_CLAIMS_PER_PURCHASE_CAP = 50


async def list_claims_for_purchase(
    db: MongoDBClient,
    user_id: UUID,
    purchase_id: UUID,
    limit: int = _CLAIMS_PER_PURCHASE_CAP,
) -> list[dict[str, object]]:
    """Return the claims attached to a single purchase, owned by `user_id`.

    Used by the enriched `GET /api/v1/purchases/:id` bundle (ticket 5.6) to
    populate the "Claims on this purchase" card. Pipeline reuses the shared
    `_CLAIMS_PURCHASE_LOOKUP_STAGE` / `_CLAIM_LIST_PROJECT_STAGE` constants
    so each row is identically-shaped to a `/claims` list row — the
    frontend can render via the same `ClaimListItem`-style helpers
    (`ClaimOutcomeBadge`, `claimTypeLabel`, `formatMoney`).

    Sort is `updated_at DESC, _id DESC` (same as `list_claims`) so newest
    activity surfaces first. No cursor — `limit` is a hard cap and any
    overflow is silently truncated. Heavy claim fields stay off-wire.

    Ownership is enforced by including `user_id` in the `$match`, NOT via
    a separate guard. A purchase owned by another user simply yields zero
    rows — never leaks claim existence across users.
    """
    # Defensive clamp:
    #   - Cap on the top end: a future caller passing a value larger
    #     than `_CLAIMS_PER_PURCHASE_CAP` must not bypass the hard cap.
    #   - Floor on the bottom end: MongoDB's aggregation `$limit`
    #     REQUIRES a strictly positive integer — `{"$limit": 0}` (or
    #     negative) raises "$limit requires a positive number" at the
    #     server. Floor at 1 so a 0/negative caller still gets a sane
    #     (empty) result instead of a 500.
    safe_limit = max(1, min(int(limit), _CLAIMS_PER_PURCHASE_CAP))
    match: dict[str, Any] = {"user_id": user_id, "purchase_id": purchase_id}
    pipeline: list[dict[str, Any]] = [
        {"$match": match},
        {"$sort": {"updated_at": -1, "_id": -1}},
        {"$limit": safe_limit},
        _CLAIMS_PURCHASE_LOOKUP_STAGE,
        _CLAIMS_PURCHASE_UNWIND_STAGE,
        _CLAIM_LIST_PROJECT_STAGE,
    ]
    raw_docs = await db.aggregate("claims", pipeline)
    return [
        ClaimListItem.model_validate(d).model_dump(mode="json", by_alias=True) for d in raw_docs
    ]


async def get_claim_detail(
    db: MongoDBClient,
    user_id: UUID,
    claim_id: UUID,
) -> dict[str, object]:
    """Return a claim with its linked purchase + policy + evidence snapshot
    metadata.

    404s on missing claim or ownership mismatch.

    `evidence_captured_at` is sourced from the `PriceHistory` row whose
    `(purchase_id, evidence_screenshot_url)` pair matches the claim's —
    the monitor-agent writes both the snapshot link AND the
    `checked_at` timestamp atomically, so a single lookup yields the
    real capture time. Falls back to `null` when:
      - the claim has no `evidence_screenshot_url` (Gemini draft
        generated without a price-drop event), OR
      - no matching `PriceHistory` row exists (legacy claims pre-4.12,
        or a rogue write).
    The frontend then hides the captured-at pill rather than showing
    `updated_at` as a proxy (ticket 5.8 — accurate-or-absent).
    """
    claim = await _load_owned_claim(db, claim_id, user_id)

    # Parallelize the three follow-up reads — all are user-scoped reads
    # with no cross-dependency, so a single round-trip-of-three saves
    # two network RTTs vs. sequential. `claim.platform` is `str | None`
    # on the tolerant model; only attempt the policy lookup when it's
    # both present and a known Platform value. An unknown platform
    # string yields no policy (frontend handles null).
    policy_platform = _safe_platform_value(claim.platform)
    purchase_id = claim.purchase_id
    purchase_task = db.get_purchase(purchase_id) if purchase_id is not None else _none_async()
    policy_task = db.get_policy(policy_platform) if policy_platform is not None else _none_async()
    snapshot_task = _find_evidence_snapshot(db, claim)
    purchase, policy, snapshot = await asyncio.gather(purchase_task, policy_task, snapshot_task)

    evidence_captured_at = (
        snapshot.checked_at.isoformat()
        if snapshot is not None and snapshot.checked_at is not None
        else None
    )

    return {
        "claim": claim.model_dump(mode="json", by_alias=True),
        "purchase": purchase.model_dump(mode="json", by_alias=True) if purchase else None,
        "policy": policy.model_dump(mode="json", by_alias=True) if policy else None,
        "evidence_url": claim.evidence_screenshot_url,
        "evidence_captured_at": evidence_captured_at,
    }


async def _find_evidence_snapshot(
    db: MongoDBClient,
    claim: ClaimReadTolerant,
) -> PriceHistoryReadTolerant | None:
    """Look up the `PriceHistory` row whose snapshot the claim cites.

    Returns `None` (no error) when the claim has insufficient data to
    join — null `purchase_id` or null `evidence_screenshot_url` — or
    when no matching row exists. Read-tolerant variant: a legacy
    PriceHistory doc with an enum-value the strict schema no longer
    accepts (e.g. a deprecated `source`) must not break the detail
    page.
    """
    if claim.evidence_screenshot_url is None or claim.purchase_id is None:
        return None
    return await db.find_one(
        "price_history",
        {
            "purchase_id": claim.purchase_id,
            "evidence_screenshot_url": claim.evidence_screenshot_url,
        },
        PriceHistoryReadTolerant,
    )


def _safe_platform_value(raw: str | None) -> str | None:
    """Return the platform string only if it maps to a known `Platform` enum.

    Legacy claims may carry a platform value that no longer exists in the
    enum (same family of bug as the rogue `claim_type` audit). Returning
    `None` here makes the policy lookup a no-op rather than crashing.
    """
    if raw is None:
        return None
    try:
        return Platform(raw).value
    except ValueError:
        return None


async def _none_async() -> None:
    """Awaitable that resolves to None — placeholder for `asyncio.gather`
    when one branch of the join has no work to do (e.g. the claim has a
    null `platform` or `purchase_id`)."""
    return None


async def approve_claim(
    db: MongoDBClient,
    publisher: PubSubPublisher,
    user_id: UUID,
    claim_id: UUID,
    send_override: SendMode | None = None,
    edited_draft_content: str | None = None,
) -> dict[str, object]:
    """Approve a draft claim — transitions outcome `(draft_pending |
    queued_for_send) → pending` and publishes claim.approved for the
    claim-agent to actually submit.

    `queued_for_send` is accepted (ticket 5.15 / WI-6) so the
    auto-send-queue's "Send now" button reuses this endpoint instead of
    adding a dedicated route — same approve semantics, just an
    additional pre-state. The `auto_send_at` queue marker is cleared on
    both paths so the Cloud Scheduler worker (WI-10) cannot pick the
    claim up after a manual send.

    409 if the claim is in any other state. The race where the worker
    auto-submits the same tick the user clicks "Send now" surfaces as
    a 409 here; the FE banner treats that 409 as success ("already
    sent") per WI-9 H3.
    """
    claim = await _load_owned_claim(db, claim_id, user_id)
    # `claim.outcome` is `str | None` on the tolerant model. Compare to
    # the canonical enum values rather than the enum instances.
    if claim.outcome not in (
        ClaimOutcome.DRAFT_PENDING.value,
        ClaimOutcome.QUEUED_FOR_SEND.value,
    ):
        raise ApiError(
            "claim_not_approvable",
            f"Claim cannot be approved in state {claim.outcome!r}",
            status_code=409,
        )

    now = datetime.now(UTC)

    # Two write paths:
    #
    # 1. No edited draft → plain `partial_update` over the scalar fields
    #    (outcome / submitted_at / send_override / auto_send_at-clear).
    #    The `Claim` field validations on these scalars run via
    #    `TypeAdapter` per-field; no historical sub-document is read or
    #    rewritten. This is the strict-on-write contract from the
    #    original §6 fix.
    #
    # 2. Edited draft → append the new `DraftVersion` via Mongo `$push`
    #    in the SAME write that $sets the scalars. `partial_update` with
    #    `draft_versions: [...new_array...]` would re-validate every
    #    historical entry against the strict `DraftVersion` schema —
    #    same class of bug as the original §6 limitation, just one
    #    level deeper. With `$push`, the existing entries are never read
    #    or rewritten; ONLY the new element is validated, against the
    #    nested `DraftVersion` model. (Bug-bot finding on PR #144,
    #    second round.)
    if edited_draft_content is None:
        updates: dict[str, Any] = {
            "send_override": (send_override.value if send_override is not None else None),
            "submitted_at": now,
            "outcome": ClaimOutcome.PENDING.value,
            # Clear the queue marker. Harmless when the claim came from
            # `draft_pending` (the field was already null); load-bearing
            # when it came from `queued_for_send` (the WI-10 scheduler
            # filters on `auto_send_at <= now`, and we want it idle).
            "auto_send_at": None,
        }
        success = await db.partial_update("claims", claim_id, updates, model=Claim)
    else:
        new_version_no = len(claim.draft_versions) + 1
        new_version = DraftVersion(
            version=new_version_no,
            content=edited_draft_content,
            generated_by=DraftGeneratedBy.USER_EDIT,
            at=now,
        )
        success = await db.array_push(
            "claims",
            claim_id,
            field="draft_versions",
            element=new_version,
            element_model=DraftVersion,
            set_fields={
                # Pair the $push with the scalar mutations atomically —
                # one write, one $set, no torn states. The
                # `draft_content == draft_versions[-1].content` invariant
                # is preserved because we set draft_content to the same
                # content we just $push'd.
                "draft_content": edited_draft_content,
                "send_override": (send_override.value if send_override is not None else None),
                "submitted_at": now,
                "outcome": ClaimOutcome.PENDING.value,
                # Same auto_send_at clear as the plain-approve path; the
                # queue marker must not survive a Send-now-with-edit.
                "auto_send_at": None,
            },
            parent_model=Claim,
        )
    if not success:
        # Document deleted between read and write. Race; treat as 404.
        raise ApiError("claim_not_found", "Claim not found", status_code=404)

    # Emit a `claim_submitted` NotificationEvent so the dashboard
    # auto-send banner (and any other SSE consumer) gets the same
    # event-driven "Sent ✓" signal whether the submission came from
    # the scheduler worker (apps/claim-agent/src/main.py L487-L498
    # already writes this on the auto path) or from a user clicking
    # Send-now in the banner / claim header. Before this commit the
    # Send-now path published `claim.approved` Pub/Sub but the topic
    # has no subscriber yet (4.18 work), so no SSE signal would have
    # reached the FE and the banner's "Sent ✓" would depend solely on
    # an optimistic 0:00 flip. Writing the notification here closes
    # that gap. Refund amount comes from the tolerant claim (may be
    # null for degraded docs); submitted_via is unchanged on this
    # write (claim-agent sets it downstream after the actual send) so
    # it passes through as whatever the tolerant load saw.
    await write_notification_event(
        db=db,
        user_id=str(claim.user_id) if claim.user_id is not None else "",
        event_type=NotificationEventType.CLAIM_SUBMITTED,
        entity_type=NotificationEntityType.CLAIM,
        entity_id=str(claim_id),
        data={
            "claim_id": str(claim_id),
            "submitted_via": claim.submitted_via,
            "refund_amount": claim.claim_amount,
        },
    )

    # Build the Pub/Sub payload from the tolerant claim plus our just-written
    # mutations. `claim` is a `ClaimReadTolerant` so every field that was
    # required-on-strict is now `T | None` here — `str(None)` produces the
    # literal "None" string, which is the wrong wire shape (downstream
    # consumers parse `purchase_id` as a UUID). Each UUID-bearing field
    # gets an explicit None guard so a degraded claim produces a JSON null
    # rather than a poisonous `"None"` literal. `claim.platform` /
    # `claim_type` are already `str | None`, so they pass through verbatim.
    # The just-written draft body, falling back to whatever the tolerant
    # load saw if no edit was supplied.
    effective_draft = (
        edited_draft_content if edited_draft_content is not None else claim.draft_content
    )
    event_payload = {
        "event_id": str(uuid4()),
        "claim_id": str(claim.id) if claim.id is not None else None,
        "user_id": str(claim.user_id) if claim.user_id is not None else None,
        "purchase_id": str(claim.purchase_id) if claim.purchase_id is not None else None,
        "platform": claim.platform,
        "claim_type": claim.claim_type,
        "claim_amount": claim.claim_amount,
        "currency": claim.currency,
        "draft_content": effective_draft,
        "send_override": send_override.value if send_override is not None else None,
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
            "Failed to publish claim.approved for claim %s; rolling back outcome", claim.id
        )
        try:
            await db.partial_update(
                "claims",
                claim_id,
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
                claim.id,
            )
        raise ApiError(
            "publish_failed",
            "Claim approval failed; please retry.",
            status_code=502,
        ) from None

    # `submitted_via` is unchanged on this write (claim-agent sets it
    # downstream); pass through whatever was loaded. `claim_id` here is
    # the request param (always non-null), not `claim.id` from the
    # tolerant load — keeps the response shape stable even on a degraded
    # doc with a (theoretical) null `_id`.
    return {
        "claim_id": str(claim_id),
        "submitted_at": now.isoformat(),
        "submitted_via": claim.submitted_via,
    }


async def cancel_claim(
    db: MongoDBClient,
    user_id: UUID,
    claim_id: UUID,
    reason: str | None = None,
) -> dict[str, object]:
    """Cancel a claim. Allowed when:
      - the claim is still DRAFT_PENDING (user hasn't approved), OR
      - the claim is QUEUED_FOR_SEND (auto-send queue, ticket 5.15 /
        WI-6) — clears `auto_send_at` so the scheduler worker can't
        pick it up after the cancel, OR
      - the claim is PENDING with `send_override == auto` and is
        within the 5-minute auto-send hold window (claim-agent
        honors auto_send_delay_seconds before actually dispatching,
        so a recent PENDING-in-auto is still cancellable).

    409 if the claim is past the cancellation window. The race where
    the WI-10 scheduler auto-submits the same tick the user clicks
    Cancel surfaces as a 409 here; the FE banner treats that 409 as
    "already sent" (the user's intent was satisfied — they wanted to
    stop a queue, but the queue already drained) and removes the
    banner entry rather than showing an error toast (WI-9 H3).
    """
    claim = await _load_owned_claim(db, claim_id, user_id)

    now = datetime.now(UTC)
    # The 5-min cancel window is the auto-send hold buffer — claim-agent
    # delays auto-mode sends by auto_send_delay_seconds before actually
    # dispatching. Approval-mode claims have no such buffer; once they're
    # PENDING they're considered queued for human-initiated send, so cancel
    # after submission isn't safe.
    within_auto_window = (
        claim.outcome == ClaimOutcome.PENDING.value
        and claim.send_override == SendMode.AUTO.value
        and claim.submitted_at is not None
        and _to_utc(claim.submitted_at) is not None
        and (now - _to_utc(claim.submitted_at)) < _AUTO_SEND_CANCEL_WINDOW
    )
    is_cancellable = (
        claim.outcome == ClaimOutcome.DRAFT_PENDING.value
        or claim.outcome == ClaimOutcome.QUEUED_FOR_SEND.value
        or within_auto_window
    )
    if not is_cancellable:
        raise ApiError(
            "claim_not_cancellable",
            f"Claim cannot be cancelled in state {claim.outcome!r}",
            status_code=409,
        )

    success = await db.partial_update(
        "claims",
        claim_id,
        {
            "outcome": ClaimOutcome.USER_CANCELLED.value,
            "outcome_note": reason,
            "resolved_at": now,
            # Clear the queue marker for the `queued_for_send` cancel
            # path. Harmless when the claim came from `draft_pending`
            # (already null) or the auto-PENDING window (also null;
            # the field is only set while queued, not after submit).
            "auto_send_at": None,
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
    if claim.outcome != ClaimOutcome.DRAFT_PENDING.value:
        raise ApiError(
            "claim_not_editable",
            f"Claim cannot be edited in state {claim.outcome!r}",
            status_code=409,
        )

    now = datetime.now(UTC)
    new_version_no = len(claim.draft_versions) + 1

    # Append the new `DraftVersion` via Mongo `$push` (atomic with the
    # `$set` of `draft_content`). Only the NEW element is validated
    # against the strict `DraftVersion` model — historical entries are
    # never re-read or re-validated on this write. That keeps the
    # strict-on-new-data contract intact while allowing a long-lived
    # claim whose existing `draft_versions[].generated_by` carries a
    # legacy value (no longer in the current `DraftGeneratedBy` enum)
    # to still be edited cleanly. The
    # `draft_content == draft_versions[-1].content` invariant is
    # preserved by setting `draft_content` to the same content we just
    # $push'd inside the same write — atomic, no torn state.
    new_version = DraftVersion(
        version=new_version_no,
        content=draft_content,
        generated_by=DraftGeneratedBy.USER_EDIT,
        at=now,
    )
    success = await db.array_push(
        "claims",
        claim_id,
        field="draft_versions",
        element=new_version,
        element_model=DraftVersion,
        set_fields={"draft_content": draft_content},
        parent_model=Claim,
    )
    if not success:
        raise ApiError("claim_not_found", "Claim not found", status_code=404)

    # Reload via the tolerant variant so an unrelated rogue field on the
    # legacy doc doesn't crash the response. Frontend renders unknown
    # enum values via Title-Case fallback labels.
    refreshed = await db.get_claim(claim_id)
    if refreshed is None:
        raise ApiError("claim_not_found", "Claim not found", status_code=404)
    return {"claim": refreshed.model_dump(mode="json", by_alias=True)}


async def fetch_evidence_for_user(
    *,
    db: MongoDBClient,
    evidence_reader: EvidenceReader,
    user_id: UUID,
    claim_id: UUID,
) -> tuple[bytes, str]:
    """Fetch a price-drop evidence blob for the route layer, scoped to the
    owning user.

    Mirrors `services.purchases.fetch_receipt_for_user` — 404 covers every
    failure mode (missing claim, non-owner, no `evidence_screenshot_url`,
    malformed gs:// URI, blob missing in GCS, bucket mismatch). We never
    403 / never leak existence across users.

    Bucket-mismatch guard: stored URIs that don't point at the configured
    `EVIDENCE_BUCKET` are refused even if the SA happens to have access.
    Defence-in-depth against a bad write that aimed at another bucket.
    """
    claim = await _load_owned_claim(db, claim_id, user_id)
    if not claim.evidence_screenshot_url:
        raise ApiError("not_found", "Evidence not found", status_code=404)

    try:
        bucket, blob_path = _parse_gs_uri(claim.evidence_screenshot_url)
    except ValueError:
        logger.warning(
            "Malformed evidence_screenshot_url claim_id=%s url=%r",
            claim_id,
            claim.evidence_screenshot_url,
        )
        raise ApiError("not_found", "Evidence not found", status_code=404) from None

    if bucket != evidence_reader.bucket_name:
        logger.warning(
            "Evidence URI bucket mismatch claim_id=%s uri_bucket=%s expected=%s",
            claim_id,
            bucket,
            evidence_reader.bucket_name,
        )
        raise ApiError("not_found", "Evidence not found", status_code=404)

    try:
        return await evidence_reader.download(blob_path=blob_path)
    except EvidenceObjectMissingError:
        logger.warning(
            "Evidence blob missing in GCS claim_id=%s blob_path=%s",
            claim_id,
            blob_path,
        )
        raise ApiError("not_found", "Evidence not found", status_code=404) from None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _parse_gs_uri(uri: str) -> tuple[str, str]:
    """Split a `gs://bucket/path/with/slashes` URI into `(bucket, path)`.

    Raises `ValueError` for any malformed input. The caller maps that to
    a 404 rather than a 500 so a stored bogus URI doesn't leak as an
    internal-error surface to the client. Twin of `services.purchases._parse_gs_uri`
    — duplicated here (rather than imported) because both call sites want a
    pure-function dependency local to their service module, and the
    function is 5 lines of trivially-correct logic that won't drift.
    """
    if not uri.startswith("gs://"):
        raise ValueError(f"Not a gs:// URI: {uri!r}")
    remainder = uri[len("gs://") :]
    bucket, sep, path = remainder.partition("/")
    if not bucket or not sep or not path:
        raise ValueError(f"Malformed gs:// URI (missing bucket or path): {uri!r}")
    return bucket, path


async def _load_owned_claim(
    db: MongoDBClient,
    claim_id: UUID,
    user_id: UUID,
) -> ClaimReadTolerant:
    """Return the claim if it exists AND belongs to user_id; 404 otherwise.

    Returns a `ClaimReadTolerant` so a legacy doc with a now-invalid
    enum value (e.g. `claim_type='price_drop_refund'` from a pre-2.2
    schema scratch) doesn't 500 the detail / approve / cancel / edit
    endpoints. Callers compare enum-typed fields by string value
    (e.g. `claim.outcome == ClaimOutcome.DRAFT_PENDING.value`) and pass
    only mutated fields back through `db.partial_update`, which
    re-validates per-field against the strict `Claim` annotations.
    """
    claim = await db.find_one("claims", {"_id": claim_id, "user_id": user_id}, ClaimReadTolerant)
    if claim is None:
        raise ApiError("claim_not_found", "Claim not found", status_code=404)
    return claim


def _to_utc(dt: datetime) -> datetime:
    """Coerce a possibly-naive datetime to UTC for safe comparison with now()."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


__all__ = [
    "Q_MAX_LENGTH",
    "STATUS_GROUP_OUTCOMES",
    "ClaimListItem",
    "approve_claim",
    "cancel_claim",
    "edit_claim_draft",
    "fetch_evidence_for_user",
    "get_claim_detail",
    "list_claims",
    "list_claims_for_purchase",
]
