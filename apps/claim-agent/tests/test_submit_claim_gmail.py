"""Tests for the gmail_send integration inside `submit_claim` (ticket 4.18).

The existing `test_claim_approved_handler.py` mocks `submit_claim` itself,
which is correct for handler-level coverage but doesn't exercise the
email-send path that landed in 4.18. These tests fill that gap by
mocking only `gmail_send` (and the secret manager constructor) and
asserting the end-to-end mapping:

  Claim with subject + recipient_email + email type
    -> gmail_send invoked with those exact values
    -> SubmitResult carries the returned message_id
    -> partial_update writes gmail_message_id, submitted_at, submitted_via

The claim-type branches for CHAT_SCRIPT / IN_STORE / SELF_SERVICE also
get a smoke test each so a future change to the email path can't
accidentally short-circuit those marker-only flows.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models import ClaimOutcome, ClaimType, SubmittedVia
from src.submit_claim import (
    ClaimSubmissionError,
    _submit_email_claim,
    submit_claim,
)

_USER_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
_CLAIM_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


def _email_claim(
    *,
    subject: str | None = "Price protection request",
    recipient_email: str | None = "claims@hilton.com",
    draft_content: str = "Body.",
) -> MagicMock:
    claim = MagicMock()
    claim.id = _CLAIM_ID
    claim.user_id = _USER_ID
    claim.claim_type = ClaimType.EMAIL
    claim.subject = subject
    claim.recipient_email = recipient_email
    claim.draft_content = draft_content
    return claim


def _gmail_result(message_id: str = "msg-abc") -> MagicMock:
    result = MagicMock()
    result.message_id = message_id
    result.thread_id = "thr-1"
    result.sent_at = datetime.now(UTC)
    return result


@pytest.mark.asyncio
async def test_email_claim_invokes_gmail_send_with_claim_fields() -> None:
    """The three claim-doc fields written at draft time (subject,
    recipient_email, draft_content) must flow into gmail_send verbatim
    — no string mutation, no re-derivation."""
    claim = _email_claim()
    user = MagicMock()
    db = AsyncMock()

    with (
        patch(
            "src.submit_claim.gmail_send", new=AsyncMock(return_value=_gmail_result())
        ) as mock_send,
        patch(
            "src.submit_claim.secretmanager.SecretManagerServiceClient", return_value=MagicMock()
        ),
        patch("src.submit_claim.resolve_bcc_from_env", return_value="audit@claimit.team"),
    ):
        result = await submit_claim(claim, user, db)

    mock_send.assert_awaited_once()
    kwargs = mock_send.call_args.kwargs
    assert kwargs["user_id"] == str(_USER_ID)
    assert kwargs["to"] == "claims@hilton.com"
    assert kwargs["subject"] == "Price protection request"
    assert kwargs["body"] == "Body."
    assert kwargs["bcc"] == "audit@claimit.team"
    assert kwargs["db"] is db

    assert result.submitted_via == SubmittedVia.GMAIL_SEND
    assert result.gmail_message_id == "msg-abc"


@pytest.mark.asyncio
async def test_email_claim_persists_gmail_message_id() -> None:
    """submit_claim should write gmail_message_id alongside
    submitted_via + submitted_at in a single partial_update."""
    claim = _email_claim()
    user = MagicMock()
    db = AsyncMock()

    with (
        patch("src.submit_claim.gmail_send", new=AsyncMock(return_value=_gmail_result("msg-xyz"))),
        patch(
            "src.submit_claim.secretmanager.SecretManagerServiceClient", return_value=MagicMock()
        ),
    ):
        await submit_claim(claim, user, db)

    db.partial_update.assert_awaited_once()
    args, _ = db.partial_update.call_args
    update_dict = args[2]
    assert update_dict["gmail_message_id"] == "msg-xyz"
    assert update_dict["submitted_via"] == SubmittedVia.GMAIL_SEND.value
    assert update_dict["outcome"] == ClaimOutcome.PENDING.value
    assert "submitted_at" in update_dict


@pytest.mark.asyncio
async def test_email_claim_missing_subject_raises_terminal() -> None:
    """Legacy claims drafted before 4.18 don't carry subject; we refuse
    to send (re-derivation at this layer would compromise the LLM-
    generated personalization)."""
    claim = _email_claim(subject=None)
    db = AsyncMock()

    with pytest.raises(ClaimSubmissionError) as excinfo:
        await _submit_email_claim(claim, db)
    assert excinfo.value.is_terminal is True
    assert "subject" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_email_claim_missing_recipient_raises_terminal() -> None:
    claim = _email_claim(recipient_email=None)
    db = AsyncMock()

    with pytest.raises(ClaimSubmissionError) as excinfo:
        await _submit_email_claim(claim, db)
    assert excinfo.value.is_terminal is True
    assert "recipient_email" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_email_claim_empty_body_raises_terminal() -> None:
    claim = _email_claim(draft_content="")
    db = AsyncMock()

    with pytest.raises(ClaimSubmissionError) as excinfo:
        await _submit_email_claim(claim, db)
    assert excinfo.value.is_terminal is True


@pytest.mark.asyncio
async def test_email_claim_token_revoked_is_terminal() -> None:
    """GmailTokenRevoked maps to ClaimSubmissionError(is_terminal=True):
    the cron worker should NOT retry on the next tick — the user has to
    re-connect Gmail first."""
    from claimit_gmail import GmailTokenRevoked

    claim = _email_claim()
    db = AsyncMock()

    with (
        patch(
            "src.submit_claim.gmail_send",
            new=AsyncMock(side_effect=GmailTokenRevoked("user revoked")),
        ),
        patch(
            "src.submit_claim.secretmanager.SecretManagerServiceClient", return_value=MagicMock()
        ),
        pytest.raises(ClaimSubmissionError) as excinfo,
    ):
        await _submit_email_claim(claim, db)
    assert excinfo.value.is_terminal is True


@pytest.mark.asyncio
async def test_email_claim_quota_is_transient() -> None:
    """GmailQuotaExceeded maps to ClaimSubmissionError(is_terminal=False):
    the cron worker should leave the claim queued and retry."""
    from claimit_gmail import GmailQuotaExceeded

    claim = _email_claim()
    db = AsyncMock()

    with (
        patch(
            "src.submit_claim.gmail_send",
            new=AsyncMock(side_effect=GmailQuotaExceeded("over quota")),
        ),
        patch(
            "src.submit_claim.secretmanager.SecretManagerServiceClient", return_value=MagicMock()
        ),
        pytest.raises(ClaimSubmissionError) as excinfo,
    ):
        await _submit_email_claim(claim, db)
    assert excinfo.value.is_terminal is False


@pytest.mark.asyncio
async def test_email_claim_generic_send_error_is_transient() -> None:
    """Generic GmailSendError (5xx, network) is treated as transient.
    Repeated failures will surface in logs; we don't promote to
    terminal automatically."""
    from claimit_gmail import GmailSendError

    claim = _email_claim()
    db = AsyncMock()

    with (
        patch(
            "src.submit_claim.gmail_send",
            new=AsyncMock(side_effect=GmailSendError("503 Backend error")),
        ),
        patch(
            "src.submit_claim.secretmanager.SecretManagerServiceClient", return_value=MagicMock()
        ),
        pytest.raises(ClaimSubmissionError) as excinfo,
    ):
        await _submit_email_claim(claim, db)
    assert excinfo.value.is_terminal is False


# ---------------------------------------------------------------------------
# Non-email branches — smoke tests so the email-path changes can't
# silently break the marker-only flows.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_script_claim_uses_clipboard_marker() -> None:
    claim = MagicMock()
    claim.id = _CLAIM_ID
    claim.user_id = _USER_ID
    claim.claim_type = ClaimType.CHAT_SCRIPT
    user = MagicMock()
    db = AsyncMock()

    with patch("src.submit_claim.gmail_send", new=AsyncMock()) as mock_send:
        result = await submit_claim(claim, user, db)

    mock_send.assert_not_awaited()
    assert result.submitted_via == SubmittedVia.CLIPBOARD
    assert result.gmail_message_id is None


@pytest.mark.asyncio
async def test_in_store_claim_uses_print_marker() -> None:
    claim = MagicMock()
    claim.id = _CLAIM_ID
    claim.user_id = _USER_ID
    claim.claim_type = ClaimType.IN_STORE
    user = MagicMock()
    db = AsyncMock()

    with patch("src.submit_claim.gmail_send", new=AsyncMock()) as mock_send:
        result = await submit_claim(claim, user, db)

    mock_send.assert_not_awaited()
    assert result.submitted_via == SubmittedVia.IN_STORE_PRINT


@pytest.mark.asyncio
async def test_self_service_claim_uses_link_marker() -> None:
    claim = MagicMock()
    claim.id = _CLAIM_ID
    claim.user_id = _USER_ID
    claim.claim_type = ClaimType.SELF_SERVICE
    user = MagicMock()
    db = AsyncMock()

    with patch("src.submit_claim.gmail_send", new=AsyncMock()) as mock_send:
        result = await submit_claim(claim, user, db)

    mock_send.assert_not_awaited()
    assert result.submitted_via == SubmittedVia.SELF_SERVICE_LINK
