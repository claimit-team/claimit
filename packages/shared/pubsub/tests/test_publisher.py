"""Publisher tests — mock the underlying PublisherClient to avoid hitting GCP."""

from __future__ import annotations

import asyncio
from concurrent.futures import Future
from unittest.mock import MagicMock

import pytest
from claimit_pubsub import events, publisher
from claimit_pubsub.events import TOPIC_PURCHASE_INGESTED, PurchaseIngestedEvent

_VALID_PAYLOAD = {
    "user_id": "11111111-1111-4111-8111-111111111111",
    "purchase_id": "22222222-2222-4222-8222-222222222222",
    "platform": "best_buy",
    "category": "retail",
    "status": "monitoring",
    "ingestion_source": "gmail",
    "overall_confidence": 0.97,
}


@pytest.fixture(autouse=True)
def _reset_publisher(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    publisher._reset_for_tests()
    yield
    publisher._reset_for_tests()


def _make_stub_client(message_id: str = "msg-1") -> MagicMock:
    future: Future[str] = Future()
    future.set_result(message_id)

    client = MagicMock()
    client.topic_path.side_effect = lambda project, topic: f"projects/{project}/topics/{topic}"
    client.publish.return_value = future
    return client


def test_publish_event_returns_message_id(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _make_stub_client("msg-42")
    monkeypatch.setattr(publisher, "_get_publisher", lambda: client)

    event = PurchaseIngestedEvent(**_VALID_PAYLOAD)

    message_id = asyncio.run(publisher.publish_event(TOPIC_PURCHASE_INGESTED, event))

    assert message_id == "msg-42"
    client.publish.assert_called_once()
    args, _kwargs = client.publish.call_args
    assert args[0] == "projects/test-project/topics/purchase.ingested"


def test_publish_event_serializes_json_body(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _make_stub_client()
    monkeypatch.setattr(publisher, "_get_publisher", lambda: client)

    event = PurchaseIngestedEvent(**_VALID_PAYLOAD)
    asyncio.run(publisher.publish_event(TOPIC_PURCHASE_INGESTED, event))

    args, _kwargs = client.publish.call_args
    body: bytes = args[1]
    decoded = PurchaseIngestedEvent.model_validate_json(body)
    assert decoded == event


def test_publish_event_sets_attributes(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _make_stub_client()
    monkeypatch.setattr(publisher, "_get_publisher", lambda: client)

    event = PurchaseIngestedEvent(**_VALID_PAYLOAD)
    asyncio.run(publisher.publish_event(TOPIC_PURCHASE_INGESTED, event))

    _args, kwargs = client.publish.call_args
    assert kwargs["event_id"] == event.event_id
    assert kwargs["schema_version"] == "1"
    assert kwargs["event_type"] == "PurchaseIngestedEvent"


def test_missing_project_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    publisher._reset_for_tests()

    monkeypatch.setattr("google.auth.default", lambda *_args, **_kwargs: (None, None))
    client = _make_stub_client()
    monkeypatch.setattr(publisher, "_get_publisher", lambda: client)

    event = PurchaseIngestedEvent(**_VALID_PAYLOAD)
    with pytest.raises(RuntimeError, match="GCP project"):
        asyncio.run(publisher.publish_event(TOPIC_PURCHASE_INGESTED, event))


def test_module_exports_match_init() -> None:
    # Confirm public surface is exactly what __init__ promises.
    assert events.PurchaseIngestedEvent is PurchaseIngestedEvent
    assert events.TOPIC_PURCHASE_INGESTED == TOPIC_PURCHASE_INGESTED
