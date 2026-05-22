"""Claim submission executor (task 3.20).

Handles actual claim submission for all 4 claim types and publishes
claim.approved after a successful submission.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from claimit_mongodb_models import ClaimOutcome, ClaimType, SubmittedVia
from claimit_mongodb_models.claim_read_tolerant import ClaimReadTolerant
from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.user import User
from claimit_pubsub.events import EventEnvelope
from claimit_pubsub.publisher import publish_event

from .send_mode import TOPIC_CLAIM_APPROVED

_log = logging.getLogger(__name__)


class ClaimApprovedEvent(EventEnvelope):
    """Published after a claim is submitted (auto or user-approved path)."""

    event_type: Literal["claim.approved"] = "claim.approved"
    user_id: str
    claim_id: str
    submitted_via: str
    approved_by: str


@dataclass
class SubmitResult:
    submitted_via: SubmittedVia
    submitted_at: datetime
    gmail_message_id: str | None = field(default=None)


async def submit_claim(
    claim: ClaimReadTolerant,
    user: User,
    db: MongoDBClient,
) -> SubmitResult:
    if claim.claim_type == ClaimType.EMAIL:
        # TODO(task-4.18): replace stub with real gmail_send once 4.18 merges
        # Expected import: from claimit_gmail import gmail_send
        # Expected call: result = await gmail_send(
        #     user_id=str(claim.user_id),
        #     to=<platform_cs_email>,   # TODO: derive from policy or claim
        #     subject=<from draft>,
        #     body=claim.draft_content,
        #     attachments=[claim.evidence_screenshot_url] if claim.evidence_screenshot_url else [],
        # )
        # BCC: os.getenv("CLAIMIT_BCC_EMAIL", "claimitbeta@gmail.com")
        _log.warning(
            "gmail_send stub: claim %s email not sent — awaiting task 4.18",
            claim.id,
        )
        submitted_via = SubmittedVia.GMAIL_SEND
        gmail_message_id: str | None = f"stub-{claim.id}"
    elif claim.claim_type == ClaimType.CHAT_SCRIPT:
        submitted_via = SubmittedVia.CLIPBOARD
        gmail_message_id = None
    elif claim.claim_type == ClaimType.IN_STORE:
        submitted_via = SubmittedVia.IN_STORE_PRINT
        gmail_message_id = None
    elif claim.claim_type == ClaimType.SELF_SERVICE:
        submitted_via = SubmittedVia.SELF_SERVICE_LINK
        gmail_message_id = None
    else:
        _log.error("Unknown claim_type %r for claim %s", claim.claim_type, claim.id)
        submitted_via = SubmittedVia.GMAIL_SEND
        gmail_message_id = None

    submitted_at = datetime.now(UTC)

    update: dict = {
        "submitted_via": submitted_via.value,
        "submitted_at": submitted_at.isoformat(),
        "outcome": ClaimOutcome.PENDING.value,
    }
    if gmail_message_id is not None:
        update["gmail_message_id"] = gmail_message_id

    await db.partial_update("claims", claim.id, update)

    return SubmitResult(
        submitted_via=submitted_via,
        submitted_at=submitted_at,
        gmail_message_id=gmail_message_id,
    )


async def publish_claim_approved(
    claim: ClaimReadTolerant,
    submitted_via: SubmittedVia,
    approved_by: str,
) -> None:
    event = ClaimApprovedEvent(
        user_id=str(claim.user_id),
        claim_id=str(claim.id),
        submitted_via=submitted_via.value,
        approved_by=approved_by,
    )
    await publish_event(TOPIC_CLAIM_APPROVED, event)
