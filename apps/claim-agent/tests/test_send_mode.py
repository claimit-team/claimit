"""Tests for send-mode branching (task 3.20)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from claimit_mongodb_models import Claim, ClaimOutcome, ClaimType, SendMode, SubmittedVia
from claimit_mongodb_models.claim_read_tolerant import ClaimReadTolerant
from src.send_mode import determine_send_mode, handle_approval_mode, handle_auto_mode
from src.submit_claim import submit_claim

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_claim(**overrides) -> Claim:
    claim = MagicMock(spec=Claim)
    claim.id = uuid4()
    claim.user_id = uuid4()
    claim.purchase_id = uuid4()
    claim.claim_type = ClaimType.EMAIL
    claim.currency = "USD"
    claim.send_override = None
    claim.auto_send_at = None
    for k, v in overrides.items():
        setattr(claim, k, v)
    return claim


def _make_user(default_mode: SendMode = SendMode.APPROVAL, **overrides) -> MagicMock:
    user = MagicMock()
    user.send_preference = MagicMock()
    user.send_preference.default_mode = default_mode
    for k, v in overrides.items():
        setattr(user, k, v)
    return user


def _make_tolerant_claim(**overrides) -> ClaimReadTolerant:
    claim = MagicMock(spec=ClaimReadTolerant)
    claim.id = uuid4()
    claim.user_id = uuid4()
    claim.purchase_id = uuid4()
    claim.claim_type = ClaimType.EMAIL
    claim.currency = "USD"
    claim.evidence_screenshot_url = None
    claim.draft_content = "Email draft body"
    claim.claim_amount = 20.0
    claim.outcome = ClaimOutcome.QUEUED_FOR_SEND
    for k, v in overrides.items():
        setattr(claim, k, v)
    return claim


# ---------------------------------------------------------------------------
# 6a — determine_send_mode uses user preference when no override
# ---------------------------------------------------------------------------


def test_determine_send_mode_uses_user_preference() -> None:
    user = _make_user(default_mode=SendMode.AUTO)
    claim = _make_claim(send_override=None)

    result = determine_send_mode(user, claim)

    assert result == SendMode.AUTO


# ---------------------------------------------------------------------------
# 6b — determine_send_mode respects per-claim send_override
# ---------------------------------------------------------------------------


def test_determine_send_mode_respects_send_override() -> None:
    user = _make_user(default_mode=SendMode.AUTO)
    claim = _make_claim(send_override=SendMode.APPROVAL)

    result = determine_send_mode(user, claim)

    assert result == SendMode.APPROVAL


# ---------------------------------------------------------------------------
# 6c — handle_approval_mode sets awaiting_approval outcome and publishes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_approval_mode_sets_correct_outcome() -> None:
    claim = _make_claim()
    db = AsyncMock()
    db.partial_update.return_value = True

    with patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish:
        await handle_approval_mode(
            claim=claim,
            db=db,
            event_platform_id="best_buy",
            refund_amount=20.0,
        )

    db.partial_update.assert_awaited_once_with(
        "claims",
        claim.id,
        {"outcome": ClaimOutcome.AWAITING_APPROVAL.value},
    )

    mock_publish.assert_awaited_once()
    topic, event = mock_publish.await_args.args
    assert topic == "claim.drafted"
    assert event.send_mode == "approval"
    assert event.auto_send_at is None

    claim.model_copy.assert_called_once_with(update={"outcome": ClaimOutcome.AWAITING_APPROVAL})


# ---------------------------------------------------------------------------
# 6d — handle_auto_mode sets queued_for_send + auto_send_at
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_auto_mode_sets_queued_outcome_and_auto_send_at() -> None:
    claim = _make_claim()
    db = AsyncMock()
    db.partial_update.return_value = True

    before = datetime.now(UTC)

    with patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish:
        _result_claim, auto_send_at = await handle_auto_mode(
            claim=claim,
            db=db,
            event_platform_id="best_buy",
            refund_amount=20.0,
            delay_seconds=300,
        )

    after = datetime.now(UTC)

    expected_low = before + timedelta(seconds=298)
    expected_high = after + timedelta(seconds=302)
    assert expected_low <= auto_send_at <= expected_high

    update_dict = db.partial_update.await_args.args[2]
    assert update_dict["outcome"] == ClaimOutcome.QUEUED_FOR_SEND.value
    assert "auto_send_at" in update_dict

    mock_publish.assert_awaited_once()
    topic, event = mock_publish.await_args.args
    assert topic == "claim.drafted"
    assert event.send_mode == "auto"
    assert event.auto_send_at is not None

    claim.model_copy.assert_called_once_with(
        update={"outcome": ClaimOutcome.QUEUED_FOR_SEND, "auto_send_at": auto_send_at}
    )


# ---------------------------------------------------------------------------
# 6e — auto-send worker skips a claim cancelled between query and get_claim
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_send_worker_skips_cancelled_claim() -> None:
    from src.main import handle_auto_send

    queued_claim = _make_tolerant_claim(outcome=ClaimOutcome.QUEUED_FOR_SEND)
    cancelled_claim = _make_tolerant_claim(
        id=queued_claim.id,
        outcome=ClaimOutcome.USER_CANCELLED,
    )

    mock_db = AsyncMock()
    mock_db.find_claims.return_value = [queued_claim]
    mock_db.get_claim.return_value = cancelled_claim

    mock_request = MagicMock()

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.submit_claim", new=AsyncMock()) as mock_submit,
    ):
        result = await handle_auto_send(mock_request)

    mock_submit.assert_not_awaited()
    assert result["processed"] == 0
    assert result["errors"] == 0


# ---------------------------------------------------------------------------
# 6f — submit_claim EMAIL path uses stub and logs a warning
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_claim_email_uses_stub(caplog: pytest.LogCaptureFixture) -> None:
    import logging

    claim = _make_tolerant_claim(claim_type=ClaimType.EMAIL)
    user = _make_user()
    db = AsyncMock()
    db.partial_update.return_value = True

    with caplog.at_level(logging.WARNING, logger="src.submit_claim"):
        result = await submit_claim(claim, user, db)

    assert result.submitted_via == SubmittedVia.GMAIL_SEND
    assert result.gmail_message_id is not None
    assert result.gmail_message_id.startswith("stub-")
    assert any("awaiting task 4.18" in r.message for r in caplog.records)
