"""Tests for notification event integration in handle_price_dropped."""

from __future__ import annotations

import base64
import json
import sys
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from claimit_mongodb_models import ClaimType, SelfEvalScore
from src.main import handle_price_dropped
from src.self_evaluate import SelfEvalResult
from src.validator import ValidationResult

_USER_ID = "11111111-1111-4111-8111-111111111111"
_PURCHASE_ID = "22222222-2222-4222-8222-222222222222"
_EVENT_ID = "evt-notif-test-001"


def _pubsub_body(event_data: dict) -> dict:
    encoded = base64.b64encode(json.dumps(event_data).encode()).decode()
    return {"message": {"data": encoded, "messageId": "msg-001"}, "subscription": "sub-001"}


def _make_event_data(**overrides: object) -> dict:
    return {
        "event_id": _EVENT_ID,
        "purchase_id": _PURCHASE_ID,
        "user_id": _USER_ID,
        "platform_id": "best_buy",
        "original_price": 100.0,
        "current_price": 80.0,
        "price_drop_amount": 20.0,
        "price_drop_pct": 20.0,
        "purchase_date": "2026-01-01T00:00:00Z",
        "detected_at": "2026-01-15T00:00:00Z",
        "currency": "USD",
        **overrides,
    }


def _make_mock_db() -> AsyncMock:
    # Populate the degraded-purchase gate fields with realistic non-null
    # values so claim-agent treats this as a processable purchase rather
    # than skipping it (PR #142 — read-tolerance). Anything left as the
    # default MagicMock attribute would trigger the gate.
    from datetime import datetime, timedelta

    now = datetime.now()
    purchase = MagicMock()
    purchase.id = uuid4()
    purchase.platform = "best_buy"
    purchase.price_paid = 100.0
    purchase.purchase_date = now
    purchase.window_expires = now + timedelta(days=14)
    purchase.order_id = "ord-test-001"
    purchase.product_name = "Mock Product"

    policy = MagicMock()
    policy.claim_type = "email"
    policy.id = uuid4()

    user = MagicMock()
    user.name = "Jane Doe"

    db = AsyncMock()
    db.get_purchase.return_value = purchase
    db.get_policy.return_value = policy
    db.get_user.return_value = user
    db.upsert_claim.return_value = "claim-id-str"
    return db


def _make_mock_request(body: dict) -> AsyncMock:
    req = AsyncMock()
    req.json.return_value = body
    return req


# ---------------------------------------------------------------------------
# Happy path — write_notification_event called once after upsert_claim
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_write_notification_event_called_after_upsert_claim() -> None:
    mock_db = _make_mock_db()
    claim_id = uuid4()

    claim_plan = MagicMock()
    claim_plan.draft_generator = "type_a_email"
    claim_plan.claim_type = ClaimType.EMAIL

    draft = MagicMock()
    draft.draft_content = "Generated email draft for order ord-test-001"
    draft.policy_clause_cited = "Policy text"

    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_event_data(claim_id=str(claim_id))))

    _eval_result = SelfEvalResult(
        passed=True,
        total_score=32,
        scores=SelfEvalScore(clarity=8, tone=8, accuracy=8, completeness=8),
        failed_dimensions=[],
        dimension_feedback={},
        improvement_suggestions={},
        draft_version="1",
        model_used="gemini-2.5-flash",
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.plan_claim", return_value=claim_plan),
        patch("src.main.generate_email_draft", return_value=draft),
        patch("src.main.validate", return_value=ValidationResult(valid=True)),
        patch(
            "src.main.evaluate_and_maybe_regenerate",
            new=AsyncMock(return_value=(draft, _eval_result, 1)),
        ),
        patch("src.main.write_notification_event", return_value="notif-id") as mock_write,
        patch("src.main.handle_approval_mode", new=AsyncMock(return_value=MagicMock())),
        patch("src.main.handle_auto_mode", new=AsyncMock(return_value=(MagicMock(), MagicMock()))),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "ok"
    persisted_claim = mock_db.upsert_claim.await_args.args[0]
    assert persisted_claim.id == claim_id
    mock_write.assert_called_once()
    call_kwargs = mock_write.call_args.kwargs
    assert call_kwargs["event_type"].value == "claim_drafted"
    assert call_kwargs["entity_type"].value == "claim"
    assert call_kwargs["entity_id"] == str(claim_id)


# ---------------------------------------------------------------------------
# Draft generation failure — write_notification_event must not be called
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_write_notification_event_not_called_on_draft_failure() -> None:
    mock_db = _make_mock_db()

    claim_plan = MagicMock()
    claim_plan.draft_generator = "type_a_email"
    claim_plan.claim_type = MagicMock()
    claim_plan.claim_type.value = "email"

    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_event_data()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.plan_claim", return_value=claim_plan),
        patch("src.main.generate_email_draft", side_effect=RuntimeError("Claude API down")),
        patch("src.main.write_notification_event") as mock_write,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "error"
    mock_write.assert_not_called()


# ---------------------------------------------------------------------------
# Read-tolerance smoke (PR #142): a degraded purchase must skip cleanly,
# never crash, and never write a half-baked claim or notification.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_degraded_purchase_skips_without_drafting() -> None:
    mock_db = _make_mock_db()
    # Null out one of the gate fields — simulates the rogue Purchase
    # from the §3 audit (`product_name=None`).
    mock_db.get_purchase.return_value.product_name = None

    claim_plan = MagicMock()
    claim_plan.draft_generator = "type_a_email"
    claim_plan.claim_type = ClaimType.EMAIL

    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_event_data()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.plan_claim", return_value=claim_plan),
        patch("src.main.generate_email_draft") as mock_email,
        patch("src.main.write_notification_event") as mock_write,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "skipped"
    assert result["reason"] == "degraded_purchase"
    # Generators must NOT have been invoked.
    mock_email.assert_not_called()
    # No notification on a degraded skip.
    mock_write.assert_not_called()


@pytest.mark.asyncio
async def test_unknown_platform_purchase_skips_without_drafting() -> None:
    """A purchase whose `platform` string is no longer in the Platform
    enum is degraded for drafting purposes — generators rely on the
    enum value to look up adapters/templates."""
    mock_db = _make_mock_db()
    mock_db.get_purchase.return_value.platform = "deprecated_platform"

    claim_plan = MagicMock()
    claim_plan.draft_generator = "type_a_email"
    claim_plan.claim_type = ClaimType.EMAIL

    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_event_data()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.plan_claim", return_value=claim_plan),
        patch("src.main.generate_email_draft") as mock_email,
        patch("src.main.write_notification_event") as mock_write,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "skipped"
    assert result["reason"] == "degraded_purchase"
    mock_email.assert_not_called()
    mock_write.assert_not_called()
