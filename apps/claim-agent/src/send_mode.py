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
    if claim.send_override is not None:
        return claim.send_override
    return user.send_preference.default_mode


async def handle_approval_mode(
    claim: Claim,
    db: MongoDBClient,
    event_platform_id: str,
    refund_amount: float,
) -> Claim:
    await db.partial_update(
        "claims",
        claim.id,
        {"outcome": ClaimOutcome.AWAITING_APPROVAL.value},
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
    return claim.model_copy(update={"outcome": ClaimOutcome.AWAITING_APPROVAL})


async def handle_auto_mode(
    claim: Claim,
    db: MongoDBClient,
    event_platform_id: str,
    refund_amount: float,
    delay_seconds: int = 300,
) -> tuple[Claim, datetime]:
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
        claim_type=claim.claim_type.value,
        refund_amount=refund_amount,
        currency=claim.currency,
        send_mode="auto",
        auto_send_at=auto_send_at.isoformat(),
    )
    await publish_event(TOPIC_CLAIM_DRAFTED, event)
    updated = claim.model_copy(
        update={
            "outcome": ClaimOutcome.QUEUED_FOR_SEND,
            "auto_send_at": auto_send_at,
        }
    )
    return updated, auto_send_at
