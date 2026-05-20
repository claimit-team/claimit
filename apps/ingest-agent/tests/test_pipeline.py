"""Tests for the ingest pipeline orchestrator."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock

import pytest
from claimit_pubsub import PurchaseIngestedEvent
from claimit_pubsub.events import TOPIC_PURCHASE_INGESTED
from src import extractor, pipeline
from src.dedup import DuplicateReceiptError
from src.extractor import EmailForExtraction


def _sample_email() -> EmailForExtraction:
    return EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Your order is confirmed",
        body_text="Order #A123. Widget SKU W123. Total $24.99.",
    )


def _sample_extracted_payload(overall_min: float = 0.95) -> dict[str, Any]:
    return {
        "platform": "best_buy",
        "category": "retail",
        "product_name": "Widget",
        "product_id": "W123",
        "product_url": None,
        "variant": None,
        "fare_class": None,
        "room_type": None,
        "bed_type": None,
        "rate_type": None,
        "price_paid": 24.99,
        "member_price_at_purchase": None,
        "non_member_price_at_purchase": None,
        "purchase_date": "2026-05-04T18:22:31Z",
        "purchase_date_basis": "order_date",
        "order_id": "A123",
        "member_tier_at_purchase": None,
        "extraction_confidence": {
            "platform": 0.99,
            "price": 0.98,
            "overall_min": overall_min,
            "order_id": 0.99,
            "product_name": 0.97,
            "product_id": 0.96,
            "price_paid": 0.98,
            "purchase_date": 0.95,
            "category": 0.98,
        },
    }


def _patch_extractor(monkeypatch: pytest.MonkeyPatch, payload: dict[str, Any]) -> None:
    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)


def _stub_collection(find_one_result: Any = None) -> AsyncMock:
    collection = AsyncMock()
    collection.find_one.return_value = find_one_result
    collection.insert_one.return_value = AsyncMock()
    return collection


async def test_publishes_event_when_monitoring(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_extractor(monkeypatch, _sample_extracted_payload(overall_min=0.95))
    collection = _stub_collection()
    publish_mock = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(pipeline, "publish_event", publish_mock)

    result = await pipeline.ingest_email(_sample_email(), purchases_collection=collection)

    assert result["status"] == "monitoring"
    collection.insert_one.assert_awaited_once_with(result)
    publish_mock.assert_awaited_once()
    topic, event = publish_mock.await_args.args
    assert topic == TOPIC_PURCHASE_INGESTED
    assert isinstance(event, PurchaseIngestedEvent)
    assert event.status == "monitoring"
    assert event.user_id == str(result["user_id"])
    assert event.purchase_id == str(result["_id"])
    assert event.platform == result["platform"]
    assert event.category == result["category"]
    assert event.ingestion_source == result["ingestion_source"]
    assert event.overall_confidence == result["extraction_confidence"]["overall_min"]


async def test_publishes_event_when_pending_confirmation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _sample_extracted_payload(overall_min=0.5)
    payload["extraction_confidence"]["price_paid"] = 0.5
    _patch_extractor(monkeypatch, payload)
    collection = _stub_collection()
    publish_mock = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(pipeline, "publish_event", publish_mock)

    result = await pipeline.ingest_email(_sample_email(), purchases_collection=collection)

    assert result["status"] == "pending_confirmation"
    publish_mock.assert_awaited_once()
    _topic, event = publish_mock.await_args.args
    assert event.status == "pending_confirmation"


async def test_does_not_publish_for_pending_user_edit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _sample_extracted_payload(overall_min=0.95)
    payload["product_id"] = None  # triggers fallback → pending_user_edit
    _patch_extractor(monkeypatch, payload)
    collection = _stub_collection()
    publish_mock = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(pipeline, "publish_event", publish_mock)

    result = await pipeline.ingest_email(_sample_email(), purchases_collection=collection)

    assert result["status"] == "pending_user_edit"
    collection.insert_one.assert_awaited_once()
    publish_mock.assert_not_awaited()


async def test_duplicate_receipt_skips_insert_and_publish(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_extractor(monkeypatch, _sample_extracted_payload())
    collection = _stub_collection(find_one_result={"_id": "existing-id"})
    publish_mock = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(pipeline, "publish_event", publish_mock)

    with pytest.raises(DuplicateReceiptError):
        await pipeline.ingest_email(_sample_email(), purchases_collection=collection)

    collection.insert_one.assert_not_awaited()
    publish_mock.assert_not_awaited()


async def test_event_payload_validates_against_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_extractor(monkeypatch, _sample_extracted_payload())
    collection = _stub_collection()
    captured: list[PurchaseIngestedEvent] = []

    async def capture(_topic: str, event: PurchaseIngestedEvent) -> str:
        captured.append(event)
        return "msg-1"

    monkeypatch.setattr(pipeline, "publish_event", capture)

    await pipeline.ingest_email(_sample_email(), purchases_collection=collection)

    assert len(captured) == 1
    # Round-trip the event JSON to guarantee schema conformance.
    decoded = PurchaseIngestedEvent.model_validate_json(captured[0].model_dump_json())
    assert decoded == captured[0]


async def test_threads_notifier_params_to_extract(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_extractor(monkeypatch, _sample_extracted_payload())
    collection = _stub_collection()
    publish_mock = AsyncMock(return_value="msg-1")
    monkeypatch.setattr(pipeline, "publish_event", publish_mock)

    captured: dict[str, Any] = {}

    real_extract = extractor.extract

    async def spy_extract(email: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return await real_extract(email, **kwargs)

    monkeypatch.setattr(pipeline, "extract", spy_extract)

    await pipeline.ingest_email(
        _sample_email(),
        purchases_collection=collection,
        user_email="user@example.com",
        gmail_refresh_token_ref="secret://refresh",
        gmail_connected_email="gmail@example.com",
    )

    assert captured["user_email"] == "user@example.com"
    assert captured["gmail_refresh_token_ref"] == "secret://refresh"
    assert captured["gmail_connected_email"] == "gmail@example.com"
