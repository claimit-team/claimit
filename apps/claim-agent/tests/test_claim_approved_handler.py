"""Tests for claim.approved Pub/Sub handler."""

from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from claimit_mongodb_models import ClaimOutcome, SubmittedVia
from src.main import handle_claim_approved
from src.submit_claim import SubmitResult

_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
_CLAIM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _gateway_payload() -> dict:
    return {
        "event_id": "evt-approved-001",
        "claim_id": _CLAIM_ID,
        "user_id": _USER_ID,
        "purchase_id": str(uuid4()),
        "platform": "best_buy",
        "claim_type": "email",
        "claim_amount": 50.0,
        "currency": "USD",
        "draft_content": "Draft body",
        "approved_at": "2026-01-15T00:00:00Z",
    }


def _post_submit_payload() -> dict:
    return {
        "event_id": "evt-approved-002",
        "event_type": "claim.approved",
        "user_id": _USER_ID,
        "claim_id": _CLAIM_ID,
        "submitted_via": "gmail_send",
        "approved_by": "auto",
    }


def _pubsub_body(event_dict: dict) -> dict:
    encoded = base64.b64encode(json.dumps(event_dict).encode()).decode()
    return {"message": {"data": encoded, "messageId": "msg-001"}, "subscription": "sub-001"}


def _make_mock_claim(
    *,
    outcome: str = ClaimOutcome.PENDING.value,
    submitted_via: str | None = None,
    user_id: str = _USER_ID,
) -> MagicMock:
    claim = MagicMock()
    claim.id = UUID(_CLAIM_ID)
    claim.user_id = UUID(user_id)
    claim.outcome = outcome
    claim.submitted_via = submitted_via
    claim.claim_type = "email"
    return claim


def _make_mock_request(body: dict) -> AsyncMock:
    req = AsyncMock()
    req.json.return_value = body
    return req


@pytest.mark.asyncio
async def test_claim_approved_gateway_payload_submits() -> None:
    claim = _make_mock_claim()
    user = MagicMock()
    db = AsyncMock()
    db.get_claim.return_value = claim
    db.get_user.return_value = user
    submit_result = SubmitResult(
        submitted_via=SubmittedVia.GMAIL_SEND,
        submitted_at=MagicMock(),
    )
    request = _make_mock_request(_pubsub_body(_gateway_payload()))

    with (
        patch("src.main.MongoDBClient", return_value=db),
        patch("src.main.submit_claim", new=AsyncMock(return_value=submit_result)) as mock_submit,
    ):
        result = await handle_claim_approved(request)

    assert result == {"status": "ok"}
    mock_submit.assert_awaited_once_with(claim, user, db)


@pytest.mark.asyncio
async def test_claim_approved_skips_when_already_submitted() -> None:
    claim = _make_mock_claim(submitted_via=SubmittedVia.GMAIL_SEND.value)
    db = AsyncMock()
    db.get_claim.return_value = claim
    request = _make_mock_request(_pubsub_body(_post_submit_payload()))

    with (
        patch("src.main.MongoDBClient", return_value=db),
        patch("src.main.submit_claim", new=AsyncMock()) as mock_submit,
    ):
        result = await handle_claim_approved(request)

    assert result == {"status": "skipped", "reason": "already_submitted"}
    mock_submit.assert_not_awaited()


@pytest.mark.asyncio
async def test_claim_approved_skips_when_not_pending() -> None:
    claim = _make_mock_claim(outcome=ClaimOutcome.DRAFT_PENDING.value)
    db = AsyncMock()
    db.get_claim.return_value = claim
    request = _make_mock_request(_pubsub_body(_gateway_payload()))

    with patch("src.main.MongoDBClient", return_value=db):
        result = await handle_claim_approved(request)

    assert result == {"status": "skipped", "reason": "not_pending"}


@pytest.mark.asyncio
async def test_claim_approved_permission_denied() -> None:
    claim = _make_mock_claim(user_id=str(uuid4()))
    db = AsyncMock()
    db.get_claim.return_value = claim
    request = _make_mock_request(_pubsub_body(_gateway_payload()))

    with patch("src.main.MongoDBClient", return_value=db):
        result = await handle_claim_approved(request)

    assert result == {"status": "error", "reason": "permission_denied"}


@pytest.mark.asyncio
async def test_claim_approved_claim_not_found() -> None:
    db = AsyncMock()
    db.get_claim.return_value = None
    request = _make_mock_request(_pubsub_body(_gateway_payload()))

    with patch("src.main.MongoDBClient", return_value=db):
        result = await handle_claim_approved(request)

    assert result == {"status": "error", "reason": "claim_not_found"}
