"""End-to-end /pubsub/purchase.uploaded handler tests driven with an image blob.

Companion to `test_pubsub_handler_purchase_uploaded.py`. Re-uses that file's
mock scaffolding (db, receipts reader, OIDC bypass, envelope helpers) but
drives the handler with a real JPEG-bytes fixture instead of the PDF byte
literal the existing happy-path uses, then asserts on the full effect chain
for two cases motivated by issue #183:

  1. Multi-item receipt → status `pending_user_edit`, no purchase.ingested,
     no LOW_CONFIDENCE_EXTRACT notification, price_paid is the picked item's
     price (NOT the grand total), price_paid confidence clamped <= 0.4.
  2. Single-item receipt → status `monitoring`, purchase.ingested published.

Gemini is stubbed in both cases — the goal is to verify the wiring around
`extract_from_blob`, not the model itself. A separate live OCR smoke
(`scripts/ocr_smoke.py`) exercises the real model.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from claimit_pubsub import PurchaseIngestedEvent
from fastapi.testclient import TestClient
from src import main as main_module
from src.extractor import ExtractedPurchaseFields
from src.main import app
from tests.test_pubsub_handler_purchase_uploaded import (
    PURCHASE_ID,
    USER_ID,
    _clear_overrides,
    _encode_event,
    _envelope,
    _event_payload,
    _purchase_doc,
    _setup_overrides,
)

IMAGE_FIXTURE = Path(__file__).parent / "fixtures" / "multi_item_receipt.jpg"


@pytest.fixture(autouse=True)
def _disable_oidc(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mirror the autouse fixture in test_pubsub_handler_purchase_uploaded.py
    — autouse scopes to a single module, so the bypass must be repeated here.
    """
    monkeypatch.setenv("PUBSUB_AUTH_DISABLED", "1")


def _image_bytes() -> bytes:
    return IMAGE_FIXTURE.read_bytes()


def _multi_item_extracted() -> ExtractedPurchaseFields:
    """Mirrors the multi-item output the model returns for the issue's
    Best Buy receipt — picks the MacBook, sets price to the item price,
    flags line_items_detected=4, and self-downgrades price_paid confidence.
    """
    return ExtractedPurchaseFields.model_validate(
        {
            "platform": "best_buy",
            "category": "retail",
            "product_name": "MB 12.0",
            "product_id": "MF855LL/A",
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 872.44,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "purchase_date": "2024-01-01T12:00:00Z",
            "purchase_date_basis": "order_date",
            "order_id": "200002162609577",
            "member_tier_at_purchase": None,
            "line_items_detected": 4,
            "extraction_confidence": {
                "platform": 0.99,
                "price": 0.3,
                "overall_min": 0.3,
                "order_id": 0.99,
                "product_name": 0.95,
                "product_id": 0.96,
                "price_paid": 0.3,
                "purchase_date": 0.0,
                "member_tier_at_purchase": None,
                "variant": None,
                "category": 0.98,
            },
        }
    )


def _single_item_extracted() -> ExtractedPurchaseFields:
    """High-confidence single-item extraction — what a well-formed
    single-product receipt should look like after the changes."""
    return ExtractedPurchaseFields.model_validate(
        {
            "platform": "best_buy",
            "category": "retail",
            "product_name": "Sony WH-1000XM5",
            "product_id": "6505729",
            "product_url": None,
            "variant": "Black",
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 349.99,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "purchase_date": "2026-05-04T18:22:31Z",
            "purchase_date_basis": "order_date",
            "order_id": "BBY-987654",
            "member_tier_at_purchase": None,
            "line_items_detected": 1,
            "extraction_confidence": {
                "platform": 0.99,
                "price": 0.97,
                "overall_min": 0.97,
                "order_id": 0.99,
                "product_name": 0.98,
                "product_id": 0.96,
                "price_paid": 0.97,
                "purchase_date": 0.97,
                "category": 0.98,
            },
        }
    )


def test_handler_image_multi_item_routes_to_pending_user_edit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Full handler chain on a real JPEG-bytes blob: model returns a
    multi-item extraction → partial_update writes pending_user_edit
    with price_paid = picked item's price and clamped price confidence.
    """
    image_bytes = _image_bytes()
    received_mime: list[str] = []

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        # The handler must hand the raw image bytes through to the
        # extractor with the right mime — verifies _select_mime_type
        # picked up the GCS metadata.
        assert data == image_bytes
        received_mime.append(mime_type)
        return _multi_item_extracted()

    publish = AsyncMock(return_value="msg-finalize")
    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    monkeypatch.setattr("src.finalize.publish_event", publish)

    db, reader = _setup_overrides(
        purchase=_purchase_doc(receipt_storage_url="gs://test-bucket/receipts/u/p/x.jpg"),
        blob=(image_bytes, "image/jpeg"),
    )
    try:
        with TestClient(app) as client:
            envelope = _envelope(
                _encode_event(
                    _event_payload(
                        receipt_storage_url="gs://test-bucket/receipts/u/p/x.jpg",
                        content_type="image/jpeg",
                    )
                )
            )
            resp = client.post("/pubsub/purchase.uploaded", json=envelope)

        assert resp.status_code == 200
        assert resp.json() == {"status": "ack"}
        reader.download.assert_awaited_once_with(blob_path="receipts/u/p/x.jpg")
        assert received_mime == ["image/jpeg"]

        db.partial_update.assert_awaited_once()
        args = db.partial_update.await_args.args
        update_dict = args[2]
        assert update_dict["status"] == "pending_user_edit"
        assert update_dict["price_paid"] == 872.44
        assert update_dict["product_name"] == "MB 12.0"
        assert update_dict["product_id"] == "MF855LL/A"
        # Defensive clamp leaves an already-low confidence alone.
        assert update_dict["extraction_confidence"]["price_paid"] == 0.3
        assert update_dict["extraction_confidence"]["overall_min"] <= 0.3
        # `line_items_detected` is transient — must not be persisted.
        assert "line_items_detected" not in update_dict

        # pending_user_edit is NOT in PUBLISHABLE_STATUSES → monitor-agent
        # must not see this purchase until the user edits.
        publish.assert_not_awaited()
        # No proactive notification for pending_user_edit either.
        db.upsert_notification_event.assert_not_awaited()
    finally:
        _clear_overrides()


def test_handler_image_single_item_happy_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression guard: a normal single-item image receipt must still
    auto-start monitoring and publish purchase.ingested, never landing
    in pending_user_edit. This is the case the issue's author asked us
    to protect when adding the multi-item routing.
    """
    image_bytes = _image_bytes()

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        return _single_item_extracted()

    publish = AsyncMock(return_value="msg-finalize")
    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    monkeypatch.setattr("src.finalize.publish_event", publish)

    db, _reader = _setup_overrides(
        purchase=_purchase_doc(receipt_storage_url="gs://test-bucket/receipts/u/p/x.jpg"),
        blob=(image_bytes, "image/jpeg"),
    )
    try:
        with TestClient(app) as client:
            envelope = _envelope(
                _encode_event(
                    _event_payload(
                        receipt_storage_url="gs://test-bucket/receipts/u/p/x.jpg",
                        content_type="image/jpeg",
                    )
                )
            )
            resp = client.post("/pubsub/purchase.uploaded", json=envelope)

        assert resp.status_code == 200
        update_dict = db.partial_update.await_args.args[2]
        assert update_dict["status"] == "monitoring"
        assert update_dict["price_paid"] == 349.99
        # Confidence is left intact when line_items_detected == 1.
        assert update_dict["extraction_confidence"]["price_paid"] == 0.97

        publish.assert_awaited_once()
        _topic, event = publish.await_args.args
        assert isinstance(event, PurchaseIngestedEvent)
        assert event.status == "monitoring"
        assert event.user_id == str(USER_ID)
        assert event.purchase_id == str(PURCHASE_ID)
    finally:
        _clear_overrides()
