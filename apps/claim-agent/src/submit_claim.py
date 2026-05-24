"""Claim submission executor (task 3.20 + ticket 4.18).

Handles actual claim submission for all 4 claim types and publishes
claim.approved after a successful submission.

For EMAIL-type claims this now (ticket 4.18) calls Gmail Send via
`claimit_gmail.gmail_send`, which dispatches the LLM-generated draft
to the platform's CS address from the user's own Gmail account. Other
claim types remain manual-mode markers (clipboard / in-store / link)
because they don't have a programmatic send channel — the user
completes those out-of-band.

The Gmail Send call requires three pieces persisted at draft time
(see main.py:366-381):
  - `claim.recipient_email`  (resolved from Policy.claim_email)
  - `claim.subject`          (LLM-generated, written by 3.14)
  - `claim.draft_content`    (the body)

Send-time failure handling: gmail_send raises typed exceptions for
token revocation, quota, and generic send errors. We map them to
ClaimSubmissionError with an `is_terminal` flag so the auto-send
loop (main.py:562-580) can roll back the claim outcome to
QUEUED_FOR_SEND on transient errors and surface terminal failures
to the user without burning retries.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from claimit_gmail import (
    GmailQuotaExceededError,
    GmailSendError,
    GmailTokenRevokedError,
    gmail_send,
    resolve_bcc_from_env,
)
from claimit_mongodb_models import ClaimOutcome, ClaimType, SubmittedVia
from claimit_mongodb_models.claim_read_tolerant import ClaimReadTolerant
from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.user import User
from claimit_pubsub.events import EventEnvelope
from claimit_pubsub.publisher import publish_event
from google.cloud import secretmanager

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


class ClaimSubmissionError(Exception):
    """Submission failed in a way the caller should react to.

    `is_terminal=True`: don't retry on next cron tick — the failure
    won't resolve by waiting (token revoked, missing fields). Caller
    should surface to the user via notification.

    `is_terminal=False`: transient (quota, network). Caller can leave
    the claim queued and the next cron tick will retry.
    """

    def __init__(self, message: str, *, is_terminal: bool) -> None:
        super().__init__(message)
        self.is_terminal = is_terminal


async def submit_claim(
    claim: ClaimReadTolerant,
    user: User,
    db: MongoDBClient,
) -> SubmitResult:
    if claim.claim_type == ClaimType.EMAIL:
        submit_result = await _submit_email_claim(claim, db)
        submitted_via = submit_result.submitted_via
        gmail_message_id = submit_result.gmail_message_id
        submitted_at = submit_result.submitted_at
    elif claim.claim_type == ClaimType.CHAT_SCRIPT:
        submitted_via = SubmittedVia.CLIPBOARD
        gmail_message_id = None
        submitted_at = datetime.now(UTC)
    elif claim.claim_type == ClaimType.IN_STORE:
        submitted_via = SubmittedVia.IN_STORE_PRINT
        gmail_message_id = None
        submitted_at = datetime.now(UTC)
    elif claim.claim_type == ClaimType.SELF_SERVICE:
        submitted_via = SubmittedVia.SELF_SERVICE_LINK
        gmail_message_id = None
        submitted_at = datetime.now(UTC)
    else:
        raise ValueError(f"Unhandled claim_type {claim.claim_type!r} for claim {claim.id}")

    update: dict = {
        "submitted_via": submitted_via.value,
        "submitted_at": submitted_at,
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


async def _submit_email_claim(claim: ClaimReadTolerant, db: MongoDBClient) -> SubmitResult:
    """Dispatch an EMAIL-type claim via Gmail Send (ticket 4.18).

    Pulls `subject` + `recipient_email` from the claim doc (written by
    the draft pipeline — see main.py:366-381). If either is missing
    (legacy claim drafted before 4.18), raises terminal ClaimSubmissionError
    because re-deriving the LLM subject at this layer would compromise
    quality and the recipient lookup belongs at draft time alongside
    policy resolution.

    `db` is threaded through to gmail_send which loads the User to read
    the Gmail refresh-token ref. Yes, the caller already has the User —
    we could shave the lookup by changing gmail_send's signature to
    accept the User directly. Not worth the API churn for ~1ms on an
    indexed query. If the auto-send batch ever scales to hundreds of
    claims per minute the redundant loads become measurable, and that's
    when we should revisit.
    """
    if not claim.recipient_email:
        raise ClaimSubmissionError(
            f"Email claim {claim.id} is missing recipient_email; re-draft required.",
            is_terminal=True,
        )
    if not claim.subject:
        raise ClaimSubmissionError(
            f"Email claim {claim.id} is missing subject; re-draft required.",
            is_terminal=True,
        )
    if not claim.draft_content:
        raise ClaimSubmissionError(
            f"Email claim {claim.id} has empty draft_content; re-draft required.",
            is_terminal=True,
        )

    sm_client = secretmanager.SecretManagerServiceClient()
    bcc = resolve_bcc_from_env()

    try:
        result = await gmail_send(
            user_id=str(claim.user_id),
            to=claim.recipient_email,
            subject=claim.subject,
            body=claim.draft_content,
            bcc=bcc,
            db=db,
            sm_client=sm_client,
        )
    except GmailTokenRevokedError as err:
        _log.warning("submit_claim.token_revoked claim_id=%s err=%s", claim.id, err)
        raise ClaimSubmissionError(str(err), is_terminal=True) from err
    except GmailQuotaExceededError as err:
        _log.warning("submit_claim.quota_exceeded claim_id=%s err=%s", claim.id, err)
        raise ClaimSubmissionError(str(err), is_terminal=False) from err
    except GmailSendError as err:
        # Generic 4xx/5xx/network. Treat as transient — the auto-send
        # cron retries on the next tick. If the underlying issue is
        # actually permanent (malformed claim header, blocklisted
        # domain), repeated failures will surface in logs and we can
        # escalate to terminal then.
        _log.warning("submit_claim.gmail_error claim_id=%s err=%s", claim.id, err)
        raise ClaimSubmissionError(str(err), is_terminal=False) from err

    _log.info(
        "submit_claim.gmail_sent claim_id=%s message_id=%s",
        claim.id,
        result.message_id,
    )
    return SubmitResult(
        submitted_via=SubmittedVia.GMAIL_SEND,
        submitted_at=result.sent_at,
        gmail_message_id=result.message_id,
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
