"""Tests for the shared finalize seam (ticket 5.14, A4)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import (
    MongoDBClient,
    NotificationEntityType,
    NotificationEventType,
    Policy,
    Purchase,
    PurchaseReadTolerant,
)
from claimit_pubsub import PurchaseIngestedEvent
from src import finalize
from src.extractor import ExtractedPurchaseFields
from src.finalize import (
    FinalizeError,
    finalize_purchase_extraction,
    finalize_purchase_extraction_failure,
)

PURCHASE_ID = UUID("22222222-2222-4222-8222-222222222222")
USER_ID = UUID("11111111-1111-4111-8111-111111111111")


def _purchase_doc(
    *,
    purchase_id: UUID = PURCHASE_ID,
    user_id: UUID = USER_ID,
    status: str = "pending_confirmation",
    platform: str = "best_buy",
    ingestion_source: str = "upload_pdf",
) -> PurchaseReadTolerant:
    """Upload-shaped sentinel doc — what api-gateway's upload_receipt writes."""
    now = datetime.now(UTC)
    return PurchaseReadTolerant.model_validate(
        {
            "_id": str(purchase_id),
            "updated_at": now.isoformat(),
            "user_id": str(user_id),
            "platform": platform,
            "category": "retail",
            "product_name": "",
            "product_id": "",
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 0.01,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "currency": "USD",
            "purchase_date": now.isoformat(),
            "purchase_date_basis": "order_date",
            "window_expires": now.isoformat(),
            "order_id": "",
            "member_tier_at_purchase": None,
            "status": status,
            "claim_type": "self_service",
            "monitoring_cadence_minutes": 360,
            "ingested_at": now.isoformat(),
            "ingestion_source": ingestion_source,
            "receipt_storage_url": "gs://test-bucket/receipts/u/p/x.pdf",
            "receipt_hash": "sha256:sentinel",
            "format_hash": "sha256:sentinel",
            "sender": "upload@user.local",
            "extraction_confidence": {
                "platform": 0.0,
                "price": 0.0,
                "overall_min": 0.0,
            },
        }
    )


def _policy(
    *,
    platform: str = "best_buy",
    window_days: int = 30,
    window_days_member: int | None = None,
) -> Policy:
    return Policy.model_validate(
        {
            "_id": "00000000-0000-4000-8000-000000000abc",
            "updated_at": datetime.now(UTC).isoformat(),
            "platform": platform,
            "category": "retail",
            "window_days": window_days,
            "window_days_member": window_days_member,
            "pre_arrival_hours_required": None,
            "covers_own_drops": True,
            "covers_competitor_drops": False,
            "claim_type": "self_service",
            "claim_url": "https://example.com",
            "claim_email": None,
            "claim_phone": None,
            "loyalty_required": False,
            "award_ticket_eligible": None,
            "bundle_exclusions": False,
            "key_exclusions": [],
            "policy_url": "https://example.com",
            "policy_text_full": "f",
            "policy_text_relevant_clause": "c",
            "last_verified": datetime.now(UTC).isoformat(),
            "active": True,
        }
    )


def _extracted(
    *,
    platform: str = "best_buy",
    overall_min: float = 0.98,
    price_paid: float = 24.99,
    member_tier: str | None = None,
    purchase_date: datetime | None = None,
    product_id: str | None = "W123",
    order_id_extra_confidence: float | None = None,
    line_items_detected: int = 1,
    price_paid_confidence: float = 0.98,
) -> ExtractedPurchaseFields:
    pd = purchase_date or datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    confidence: dict[str, Any] = {
        "platform": 0.99,
        "price": 0.98,
        "overall_min": overall_min,
        "order_id": order_id_extra_confidence if order_id_extra_confidence is not None else 0.99,
        "product_name": 0.97,
        "product_id": 0.96,
        "price_paid": price_paid_confidence,
        "purchase_date": 0.95,
        "category": 0.98,
    }
    return ExtractedPurchaseFields.model_validate(
        {
            "platform": platform,
            "category": "retail",
            "product_name": "Widget",
            "product_id": product_id,
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": price_paid,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "purchase_date": pd.isoformat(),
            "purchase_date_basis": "order_date",
            "order_id": "A123",
            "member_tier_at_purchase": member_tier,
            "line_items_detected": line_items_detected,
            "extraction_confidence": confidence,
        }
    )


def _mock_db(*, purchase: PurchaseReadTolerant, policy: Policy | None) -> AsyncMock:
    db = AsyncMock(spec=MongoDBClient)
    # First call: ownership/load; second call: post-update refresh.
    db.get_purchase = AsyncMock(side_effect=[purchase, purchase])
    db.get_policy = AsyncMock(return_value=policy)
    db.partial_update = AsyncMock(return_value=True)
    db.find_one = AsyncMock(return_value=None)
    db.upsert_notification_event = AsyncMock(return_value="event-id")
    return db


@pytest.mark.asyncio
async def test_finalize_writes_partial_update_with_extracted_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    purchase = _purchase_doc()
    extracted = _extracted(overall_min=0.98)
    db = _mock_db(purchase=purchase, policy=_policy(window_days=30))
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    db.partial_update.assert_awaited_once()
    args = db.partial_update.await_args.args
    assert args[0] == "purchases"
    assert args[1] == PURCHASE_ID
    update_dict = args[2]
    assert update_dict["platform"] == "best_buy"
    assert update_dict["product_name"] == "Widget"
    assert update_dict["product_id"] == "W123"
    assert update_dict["price_paid"] == 24.99
    assert update_dict["status"] == "monitoring"
    # Window comes from the policy_fixture (30 days), not the 15-day default.
    expected = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC) + timedelta(days=30)
    assert update_dict["window_expires"] == expected


@pytest.mark.asyncio
async def test_finalize_publishes_purchase_ingested_for_monitoring(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    purchase = _purchase_doc()
    extracted = _extracted(overall_min=0.99)
    db = _mock_db(purchase=purchase, policy=_policy())
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    publish.assert_awaited_once()
    _topic, event = publish.await_args.args
    assert isinstance(event, PurchaseIngestedEvent)
    assert event.status == "monitoring"
    assert event.user_id == str(USER_ID)
    assert event.purchase_id == str(PURCHASE_ID)
    # No low-confidence notification for high-confidence extracts.
    db.upsert_notification_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_writes_low_confidence_notification_for_pending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    purchase = _purchase_doc()
    # overall_min < 0.95 + a couple of below-threshold fields so the data
    # payload carries actionable field names for the proactive prompt.
    extracted = _extracted(overall_min=0.5, order_id_extra_confidence=0.4)
    db = _mock_db(purchase=purchase, policy=_policy())
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    # Both publish AND notification are written — frontend uses the
    # event-stream / notification to drive Mode C and the dashboard
    # Needs-Attention row.
    publish.assert_awaited_once()
    _topic, event = publish.await_args.args
    assert event.status == "pending_confirmation"

    db.upsert_notification_event.assert_awaited_once()
    notif_doc = db.upsert_notification_event.await_args.args[0]
    assert notif_doc.event_type == NotificationEventType.LOW_CONFIDENCE_EXTRACT
    assert notif_doc.entity_type == NotificationEntityType.PURCHASE
    assert notif_doc.entity_id == PURCHASE_ID
    # data must carry the purchase_id so the FE can route directly to
    # /confirm/:purchase_id from the proactive prompt (ticket 5.14 §B8).
    assert notif_doc.data["purchase_id"] == str(PURCHASE_ID)
    # Below-threshold field names are surfaced (excluding overall_min + price aggregates).
    assert "order_id" in notif_doc.data["low_confidence_fields"]
    assert "overall_min" not in notif_doc.data["low_confidence_fields"]
    assert "price" not in notif_doc.data["low_confidence_fields"]


@pytest.mark.asyncio
async def test_finalize_routes_multi_item_to_pending_user_edit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Multi-item receipts (line_items_detected > 1) MUST route to
    `pending_user_edit` regardless of high confidence scores, because
    `price_paid` is for ONE picked line and downstream monitoring would
    price-match the wrong number. See issue #183 finding #1.

    Side effects of this routing today (intentionally matching the
    fallback_used → pending_user_edit branch):
      - `pending_user_edit` is NOT in PUBLISHABLE_STATUSES → no
        purchase.ingested event (monitor-agent stays idle).
      - LOW_CONFIDENCE_EXTRACT notification only fires for
        `pending_confirmation` → no proactive notification here.
    """
    purchase = _purchase_doc()
    # Simulate the issue's Best Buy receipt: 4 itemized lines, model picks
    # the MacBook ($872.44) but with a defensive low price_paid confidence
    # per the prompt rule. All OTHER confidences high.
    extracted = _extracted(
        line_items_detected=4,
        price_paid=872.44,
        price_paid_confidence=0.3,
        overall_min=0.3,
    )
    db = _mock_db(purchase=purchase, policy=_policy(window_days=15))
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    update_dict = db.partial_update.await_args.args[2]
    assert update_dict["status"] == "pending_user_edit"
    assert update_dict["price_paid"] == 872.44
    # Defensive clamp leaves an already-low confidence alone.
    assert update_dict["extraction_confidence"]["price_paid"] == 0.3
    # No purchase.ingested for pending_user_edit — monitor-agent must
    # NOT see this until the user picks the right line.
    publish.assert_not_awaited()
    # No proactive low-confidence notification either — pending_user_edit
    # uses a different surface (the dashboard "needs attention" row from
    # the status itself, not a NotificationEvent).
    db.upsert_notification_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_clamps_overconfident_multi_item_price(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the model returns line_items_detected > 1 but a high price_paid
    confidence (ignoring the prompt rule), the in-code defensive clamp
    must downgrade it to <= 0.4 and re-aggregate overall_min.
    """
    purchase = _purchase_doc()
    extracted = _extracted(
        line_items_detected=2,
        price_paid=872.44,
        price_paid_confidence=0.99,
        overall_min=0.99,
    )
    db = _mock_db(purchase=purchase, policy=_policy(window_days=15))
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    update_dict = db.partial_update.await_args.args[2]
    assert update_dict["status"] == "pending_user_edit"
    assert update_dict["extraction_confidence"]["price_paid"] == 0.4
    assert update_dict["extraction_confidence"]["overall_min"] <= 0.4


@pytest.mark.asyncio
async def test_finalize_window_honors_policy_window_days(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    purchase = _purchase_doc()
    extracted = _extracted(
        platform="best_buy",
        purchase_date=datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC),
    )
    db = _mock_db(purchase=purchase, policy=_policy(window_days=15))
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    update_dict = db.partial_update.await_args.args[2]
    assert update_dict["window_expires"] == datetime(2026, 6, 16, 12, 0, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_finalize_uses_member_window_when_tier_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    purchase = _purchase_doc()
    extracted = _extracted(
        member_tier="my_best_buy_total",
        purchase_date=datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC),
    )
    db = _mock_db(purchase=purchase, policy=_policy(window_days=15, window_days_member=60))
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    update_dict = db.partial_update.await_args.args[2]
    assert update_dict["window_expires"] == datetime(2026, 7, 31, 12, 0, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_finalize_amazon_window_zero_yields_purchase_date(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    purchase = _purchase_doc(platform="amazon")
    pd = datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC)
    extracted = _extracted(platform="amazon", purchase_date=pd)
    db = _mock_db(purchase=purchase, policy=_policy(platform="amazon", window_days=0))
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    update_dict = db.partial_update.await_args.args[2]
    # Past-window immediately — not the 15-day fallback. Honors Amazon's
    # zero-day policy as a real Policy value.
    assert update_dict["window_expires"] == pd


@pytest.mark.asyncio
async def test_finalize_missing_policy_falls_back_to_default_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unknown platform → log + 15-day default (NOT a crash)."""
    purchase = _purchase_doc()
    pd = datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC)
    extracted = _extracted(purchase_date=pd)
    db = _mock_db(purchase=purchase, policy=None)
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=extracted)

    update_dict = db.partial_update.await_args.args[2]
    assert update_dict["window_expires"] == pd + timedelta(days=15)


@pytest.mark.asyncio
async def test_finalize_raises_when_purchase_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Purchase deleted before finalize fires → handler-friendly FinalizeError."""
    db = AsyncMock(spec=MongoDBClient)
    db.get_purchase = AsyncMock(return_value=None)
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    with pytest.raises(FinalizeError):
        await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=_extracted())
    publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_raises_when_partial_update_misses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Race: purchase deleted between read and write → FinalizeError, no publish."""
    purchase = _purchase_doc()
    db = _mock_db(purchase=purchase, policy=_policy())
    db.partial_update = AsyncMock(return_value=False)
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    with pytest.raises(FinalizeError):
        await finalize_purchase_extraction(db=db, purchase_id=PURCHASE_ID, extracted=_extracted())
    publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_returns_strict_purchase(monkeypatch: pytest.MonkeyPatch) -> None:
    purchase = _purchase_doc()
    db = _mock_db(purchase=purchase, policy=_policy())
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    result = await finalize_purchase_extraction(
        db=db, purchase_id=PURCHASE_ID, extracted=_extracted()
    )
    assert isinstance(result, Purchase)


# ---------------------------------------------------------------------------
# Extraction-failure rescue path (post-5.14 prod-verification fix).
#
# `finalize_purchase_extraction_failure` is the SAFETY NET, not the steady
# state — these tests pin its observable behavior so a future refactor
# can't silently drop the partial_update or the notification write that
# the FE confirm loader depends on to exit its "Analyzing…" poll.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_finalize_failure_writes_partial_update_with_low_conf_and_notification() -> None:
    purchase = _purchase_doc()
    db = AsyncMock(spec=MongoDBClient)
    db.get_purchase = AsyncMock(return_value=purchase)
    db.partial_update = AsyncMock(return_value=True)
    # `write_notification_event` (in claimit_mongodb_models) does a
    # `find_one` dedup check before upserting; return None so the path
    # actually inserts on this test invocation rather than hitting the
    # short-circuit branch.
    db.find_one = AsyncMock(return_value=None)
    db.upsert_notification_event = AsyncMock(return_value="event-id")

    await finalize_purchase_extraction_failure(db=db, purchase_id=PURCHASE_ID)

    # Partial update must (a) nudge overall_min off zero so the FE's
    # "still analyzing" poll exits, (b) keep platform/price confidence
    # at 0.0 (matches the upload sentinel — no claim of measurement),
    # (c) NOT touch status or any extracted field (the doc keeps the
    # `""` / 0.01 sentinel values until the user confirms).
    db.partial_update.assert_awaited_once()
    args = db.partial_update.await_args.args
    assert args[0] == "purchases"
    assert args[1] == PURCHASE_ID
    update_dict = args[2]
    assert update_dict["extraction_confidence"] == {
        "platform": 0.0,
        "price": 0.0,
        "overall_min": 0.01,
    }
    assert "status" not in update_dict
    assert "platform" not in update_dict
    assert "product_name" not in update_dict
    assert "price_paid" not in update_dict

    # Notification must carry every field the FE confirm form lights
    # up as low-confidence — without this, the proactive Mode C nudge
    # would silently not fire on rescued docs even though the form
    # opens to fully manual fill.
    db.upsert_notification_event.assert_awaited_once()
    notif_doc = db.upsert_notification_event.await_args.args[0]
    assert notif_doc.event_type == NotificationEventType.LOW_CONFIDENCE_EXTRACT
    assert notif_doc.entity_type == NotificationEntityType.PURCHASE
    assert notif_doc.entity_id == PURCHASE_ID
    assert notif_doc.data["purchase_id"] == str(PURCHASE_ID)
    assert set(notif_doc.data["low_confidence_fields"]) == {
        "product_name",
        "price_paid",
        "purchase_date",
        "order_id",
        "platform",
        "category",
    }
    assert notif_doc.data["overall_min"] == 0.01


@pytest.mark.asyncio
async def test_finalize_failure_does_not_publish_purchase_ingested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Rescue must NOT publish purchase.ingested.

    No real extraction happened — downstream subscribers (monitor-agent,
    claim-agent) have nothing to do with a sentinel doc. Publishing
    would pollute the event stream and could trigger spurious workflow
    runs against a doc with `price_paid=0.01` and empty `product_name`.
    """
    purchase = _purchase_doc()
    db = AsyncMock(spec=MongoDBClient)
    db.get_purchase = AsyncMock(return_value=purchase)
    db.partial_update = AsyncMock(return_value=True)
    db.find_one = AsyncMock(return_value=None)
    db.upsert_notification_event = AsyncMock(return_value="event-id")
    publish = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(finalize, "publish_event", publish)

    await finalize_purchase_extraction_failure(db=db, purchase_id=PURCHASE_ID)

    publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_failure_skips_when_already_finalized() -> None:
    """Redelivery clobber guard — must not over-write a happy-path finalize.

    Pub/Sub at-least-once + retries mean the rescue path can be entered
    AFTER a successful finalize already populated the doc. The guard
    keys off `extraction_confidence.overall_min`: the upload sentinel
    writes 0.0; every finalize (happy or rescue) moves it >0.0. So if
    what's on disk is >0.0, somebody already finalized — we must NOT
    partial_update, must NOT write a notification, must just log and
    return.
    """
    purchase = _purchase_doc()
    # Simulate a happy-path finalize having already populated real
    # confidence values. The exact number is irrelevant — any
    # `overall_min > 0` should trip the skip branch.
    purchase = purchase.model_copy(
        update={
            "extraction_confidence": purchase.extraction_confidence.model_copy(
                update={"overall_min": 0.87, "platform": 0.99, "price": 0.95}
            )
        }
    )

    db = AsyncMock(spec=MongoDBClient)
    db.get_purchase = AsyncMock(return_value=purchase)
    db.partial_update = AsyncMock(return_value=True)
    db.find_one = AsyncMock(return_value=None)
    db.upsert_notification_event = AsyncMock(return_value="event-id")

    await finalize_purchase_extraction_failure(db=db, purchase_id=PURCHASE_ID)

    db.partial_update.assert_not_awaited()
    db.upsert_notification_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_failure_handles_missing_purchase_without_raising(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A delete-race between extractor failure and rescue must not raise.

    The handler is already in an error branch logging the original
    extractor failure; making the rescue path raise here would leak a
    5xx from the Pub/Sub handler and cause redelivery into the same
    failure mode. Rescue is best-effort — log and return.
    """
    db = AsyncMock(spec=MongoDBClient)
    db.get_purchase = AsyncMock(return_value=None)
    db.partial_update = AsyncMock(return_value=True)
    db.upsert_notification_event = AsyncMock(return_value="event-id")
    caplog.set_level("WARNING", logger="src.finalize")

    # No exception — silent return is the contract.
    await finalize_purchase_extraction_failure(db=db, purchase_id=PURCHASE_ID)

    db.partial_update.assert_not_awaited()
    db.upsert_notification_event.assert_not_awaited()
    assert any("purchase missing" in rec.message for rec in caplog.records)
