"""End-to-end test for claim.redraft_requested — prod-shaped Mongo reads, real handler path."""

from __future__ import annotations

import base64
import json
import sys
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from claimit_mongodb_models import (
    ClaimReadTolerant,
    ClaimType,
    DraftGeneratedBy,
    NotificationEventType,
    Platform,
    Policy,
    PurchaseReadTolerant,
    SendMode,
)
from src.main import handle_claim_redraft_requested

_USER_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
_CLAIM_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
_PURCHASE_ID = uuid4()
_ORDER_ID = "BBY-ORD-001"
_NOW = datetime(2026, 3, 15, 12, 0, 0, tzinfo=UTC)

_MOCK_TEMPLATE = json.dumps(
    {
        "subject": "Price Match Refund Request — Order {{ORDER_ID}}",
        "email_body": (
            "Hello {{MERCHANT_NAME}} Customer Care,\n\n"
            "I'm writing to request a price match refund on a recent purchase.\n\n"
            "Order {{ORDER_ID}} — {{PRODUCT_NAME}} at {{ORIGINAL_PRICE}}. The current price is "
            "{{CURRENT_PRICE}}, a difference of {{REFUND_AMOUNT}} within the published price-match window.\n\n"
            "Pursuant to your policy: {{POLICY_CITATION}}\n\n"
            "Thank you,\n{{USER_NAME}}"
        ),
    }
)


class _FakeFinalEvent:
    def __init__(self, text: str) -> None:
        class _Part:
            def __init__(self, inner: str) -> None:
                self.text = inner

        class _Content:
            def __init__(self, inner: str) -> None:
                self.parts = [_Part(inner)]

        self.content = _Content(text)

    def is_final_response(self) -> bool:
        return True


class _FakeDraftRunner:
    def __init__(self, **_kwargs: object) -> None:
        pass

    async def run_async(self, **_kwargs: object):
        yield _FakeFinalEvent(_MOCK_TEMPLATE)


def _make_redraft_event(feedback: str = "make it friendlier") -> dict:
    return {
        "schema_version": 1,
        "event_id": "evt-redraft-e2e-001",
        "emitted_at": "2026-03-15T12:00:00Z",
        "event_type": "claim.redraft_requested",
        "user_id": str(_USER_ID),
        "claim_id": str(_CLAIM_ID),
        "feedback": feedback,
    }


def _pubsub_body(event_dict: dict) -> dict:
    encoded = base64.b64encode(json.dumps(event_dict).encode()).decode()
    return {"message": {"data": encoded, "messageId": "msg-e2e-001"}, "subscription": "sub-001"}


def _make_claim_doc() -> dict:
    draft_content = "Original seeded draft for BBY-ORD-001."
    return {
        "_id": _CLAIM_ID,
        "updated_at": _NOW,
        "purchase_id": _PURCHASE_ID,
        "user_id": _USER_ID,
        "platform": "best_buy",
        "claim_amount": 50.0,
        "currency": "USD",
        "claim_type": "email",
        "draft_content": draft_content,
        "draft_versions": [
            {
                "version": 1,
                "content": draft_content,
                "generated_by": "agent",
                "at": _NOW,
            }
        ],
        "redraft_count": 0,
        "policy_clause_cited": "Best Buy price match within 15 days.",
        "evidence_screenshot_url": None,
        "send_override": None,
        "submitted_at": None,
        "submitted_via": None,
        "outcome": "draft_pending",
        "outcome_note": None,
        "denial_reason_extracted": None,
        "resolved_at": None,
        "trace_id": "trace-e2e-001",
        "self_eval_attempts": 0,
    }


def _make_purchase_doc() -> dict:
    window_expires = _NOW + timedelta(days=14)
    return {
        "_id": _PURCHASE_ID,
        "updated_at": _NOW,
        "user_id": _USER_ID,
        "platform": "best_buy",
        "category": "retail",
        "product_name": "Sony WH-1000XM5",
        "product_id": "BBY-987654",
        "product_url": None,
        "variant": None,
        "fare_class": None,
        "room_type": None,
        "bed_type": None,
        "rate_type": None,
        "price_paid": 399.99,
        "member_price_at_purchase": None,
        "non_member_price_at_purchase": None,
        "currency": "USD",
        "purchase_date": _NOW,
        "purchase_date_basis": "order_date",
        "window_expires": window_expires,
        "order_id": _ORDER_ID,
        "member_tier_at_purchase": None,
        "status": "monitoring",
        "claim_type": "email",
        "monitoring_cadence_minutes": 60,
        "last_checked_at": None,
        "ingested_at": _NOW,
        "ingestion_source": "gmail",
        "receipt_storage_url": None,
        "receipt_hash": None,
        "format_hash": None,
        "sender": None,
        "extraction_confidence": {
            "platform": 1.0,
            "price": 1.0,
            "overall_min": 1.0,
        },
    }


def _make_policy() -> Policy:
    return Policy(
        _id=uuid4(),
        platform=Platform.BEST_BUY,
        category="retail",
        window_days=15,
        window_days_member=30,
        pre_arrival_hours_required=None,
        covers_own_drops=True,
        covers_competitor_drops=False,
        claim_type=ClaimType.EMAIL,
        claim_url=None,
        claim_email=None,
        claim_phone=None,
        loyalty_required=False,
        award_ticket_eligible=None,
        bundle_exclusions=True,
        key_exclusions=[],
        policy_url="https://bestbuy.com/price-match",
        policy_text_full="Full policy text.",
        policy_text_relevant_clause="Best Buy price match within 15 days.",
        last_verified=_NOW,
        active=True,
    )


def _make_user() -> MagicMock:
    user = MagicMock()
    user.name = "Jane Doe"
    user.send_preference = MagicMock()
    user.send_preference.default_mode = SendMode.APPROVAL
    user.default_location = None
    return user


def _make_mock_db(
    claim: ClaimReadTolerant,
    purchase: PurchaseReadTolerant,
    policy: Policy,
    user: MagicMock,
) -> AsyncMock:
    db = AsyncMock()
    db.get_claim.return_value = claim
    db.get_purchase.return_value = purchase
    db.get_policy.return_value = policy
    db.get_user.return_value = user
    db.find_one.return_value = None
    db.try_insert_idempotency_record = AsyncMock(return_value=True)
    db.update_idempotency_record = AsyncMock(return_value=None)
    db.atomic_append_draft_version = AsyncMock(return_value=2)
    db.array_push_and_update.return_value = True
    db.partial_update.return_value = True
    db.upsert_notification_event.return_value = "notif-e2e-001"
    return db


def _make_mock_request(body: dict) -> AsyncMock:
    req = AsyncMock()
    req.json.return_value = body
    return req


@pytest.mark.asyncio
async def test_redraft_handler_e2e_best_buy_email_from_mongo_shaped_claim() -> None:
    """Full handler path with ClaimReadTolerant claim — surfaces str enum bugs locally."""
    claim = ClaimReadTolerant.model_validate(_make_claim_doc())
    purchase = PurchaseReadTolerant.model_validate(_make_purchase_doc())
    policy = _make_policy()
    user = _make_user()
    mock_db = _make_mock_db(claim, purchase, policy, user)

    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()
    mock_search.get_search_adapter.return_value.search_policies = AsyncMock(return_value=[])

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _FakeDraftRunner),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "ok"}

    mock_db.atomic_append_draft_version.assert_awaited_once()
    append_kwargs = mock_db.atomic_append_draft_version.await_args.kwargs
    assert append_kwargs["generated_by"] == DraftGeneratedBy.ASSISTANT_REDRAFT
    assert _ORDER_ID in append_kwargs["content"]
    assert "{{" not in append_kwargs["content"]

    mock_db.upsert_notification_event.assert_awaited_once()
    notif_doc = mock_db.upsert_notification_event.await_args.args[0]
    assert notif_doc.event_type == NotificationEventType.CLAIM_DRAFTED
    assert notif_doc.data["claim_id"] == str(_CLAIM_ID)

    mock_publish.assert_awaited_once()
    topic, _event = mock_publish.await_args.args
    assert topic == "claim.drafted"
    assert _event.claim_type == "email"
