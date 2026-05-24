"""Send-mode branching for claim agent (task 3.20).

Determines whether a claim goes through user-approval flow or is queued for
automatic sending, then updates claim state and publishes claim.drafted.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Literal

from claimit_mongodb_models import Claim, ClaimOutcome, SendMode
from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.user import User
from claimit_pubsub.events import EventEnvelope
from claimit_pubsub.publisher import publish_event

from .enum_compat import enum_to_str

# TODO(task-3.20): move these constants to claimit_pubsub.events
TOPIC_CLAIM_DRAFTED = "claim.drafted"
TOPIC_CLAIM_APPROVED = "claim.approved"

_log = logging.getLogger(__name__)


class ClaimDraftedEvent(EventEnvelope):
    """Published after a claim draft is finalized and send-mode is determined."""

    event_type: Literal["claim.drafted"] = "claim.drafted"
    user_id: str
    claim_id: str
    purchase_id: str
    claim_type: str
    refund_amount: float
    currency: str
    send_mode: Literal["approval", "auto"]
    auto_send_at: str | None = None


def determine_send_mode(user: User, claim: Claim) -> SendMode:
    mode = (
        claim.send_override
        if claim.send_override is not None
        else user.send_preference.default_mode
    )
    _log.info("send_mode.determined: claim_id=%s mode=%s", claim.id, mode)
    return mode


async def handle_approval_mode(
    claim: Claim,
    db: MongoDBClient,
    event_platform_id: str,
    refund_amount: float,
) -> Claim:
    _log.info("send_mode.approval_mode.start: claim_id=%s", claim.id)
    # Write `draft_pending` (not `awaiting_approval`) so the rest of the
    # stack — 6.4 gateway gates, 5.7 FE workflow status, useReviewDraft
    # dashboard hook, scripts/seed_claims_demo.py — sees the canonical
    # "user needs to review this" outcome the rest of the stack keys on.
    #
    # Before this fix (ticket 5.15 / WI-5): a real-pipeline approval-mode
    # claim landed as `awaiting_approval`. The seed (which uses
    # `draft_pending`) masked the divergence in dev; in prod the claim
    # never surfaced on the Review-draft dashboard cards AND approve /
    # cancel / edit 409'd because the gateway gate keys on
    # DRAFT_PENDING. The frontend `mapOutcomeToWorkflowStatus` still
    # tolerates a legacy `awaiting_approval` value (read-tolerance), so
    # historical claims in either state render the same workflow label.
    #
    # `ClaimOutcome.AWAITING_APPROVAL` stays in the enum (read-tolerance:
    # historical docs may still hold it). Nothing in the writer path
    # produces it after this commit — verified by an rg guard in the
    # local gate.
    await db.partial_update(
        "claims",
        claim.id,
        {"outcome": ClaimOutcome.DRAFT_PENDING.value},
    )
    event = ClaimDraftedEvent(
        user_id=str(claim.user_id),
        claim_id=str(claim.id),
        purchase_id=str(claim.purchase_id),
        claim_type=claim.claim_type.value,
        refund_amount=refund_amount,
        currency=claim.currency,
        send_mode="approval",
        auto_send_at=None,
    )
    await publish_event(TOPIC_CLAIM_DRAFTED, event)
    _log.info("send_mode.approval_mode.published: claim_id=%s", claim.id)
    return claim.model_copy(update={"outcome": ClaimOutcome.DRAFT_PENDING})


async def handle_auto_mode(
    claim: Claim,
    db: MongoDBClient,
    event_platform_id: str,
    refund_amount: float,
    delay_seconds: int = 300,
) -> tuple[Claim, datetime]:
    _log.info("send_mode.auto_mode.start: claim_id=%s delay_seconds=%d", claim.id, delay_seconds)
    auto_send_at = datetime.now(UTC) + timedelta(seconds=delay_seconds)
    await db.partial_update(
        "claims",
        claim.id,
        {
            "outcome": ClaimOutcome.QUEUED_FOR_SEND.value,
            "auto_send_at": auto_send_at,
        },
    )
    event = ClaimDraftedEvent(
        user_id=str(claim.user_id),
        claim_id=str(claim.id),
        purchase_id=str(claim.purchase_id),
        claim_type=enum_to_str(claim.claim_type),
        refund_amount=refund_amount,
        currency=claim.currency,
        send_mode="auto",
        auto_send_at=auto_send_at.isoformat(),
    )
    await publish_event(TOPIC_CLAIM_DRAFTED, event)
    _log.info(
        "send_mode.auto_mode.queued: claim_id=%s auto_send_at=%s",
        claim.id,
        auto_send_at.isoformat(),
    )
    updated = claim.model_copy(
        update={
            "outcome": ClaimOutcome.QUEUED_FOR_SEND,
            "auto_send_at": auto_send_at,
        }
    )
    return updated, auto_send_at
