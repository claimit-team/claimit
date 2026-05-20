"""Schema tests for claimit_pubsub.events."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

import pytest
from claimit_pubsub.events import (
    TOPIC_PURCHASE_INGESTED,
    EventEnvelope,
    PurchaseIngestedEvent,
)
from pydantic import ValidationError

_VALID_PAYLOAD = {
    "user_id": "11111111-1111-4111-8111-111111111111",
    "purchase_id": "22222222-2222-4222-8222-222222222222",
    "platform": "best_buy",
    "category": "retail",
    "status": "monitoring",
    "ingestion_source": "gmail",
    "overall_confidence": 0.97,
}


def test_topic_constant() -> None:
    assert TOPIC_PURCHASE_INGESTED == "purchase.ingested"


def test_envelope_defaults_are_populated() -> None:
    event = PurchaseIngestedEvent(**_VALID_PAYLOAD)
    assert event.schema_version == 1
    assert event.event_type == "purchase.ingested"
    UUID(event.event_id)  # raises if not a UUID
    assert isinstance(event.emitted_at, datetime)
    assert event.emitted_at.tzinfo is not None
    assert event.emitted_at.utcoffset() == UTC.utcoffset(None)


def test_envelope_round_trip_through_json() -> None:
    event = PurchaseIngestedEvent(**_VALID_PAYLOAD)
    raw = event.model_dump_json()
    decoded = PurchaseIngestedEvent.model_validate_json(raw)
    assert decoded == event


def test_payload_matches_schema_keys() -> None:
    event = PurchaseIngestedEvent(**_VALID_PAYLOAD)
    body = json.loads(event.model_dump_json())
    assert set(body) == {
        "schema_version",
        "event_id",
        "emitted_at",
        "event_type",
        *_VALID_PAYLOAD,
    }


def test_pending_confirmation_status_allowed() -> None:
    PurchaseIngestedEvent(**{**_VALID_PAYLOAD, "status": "pending_confirmation"})


def test_pending_user_edit_status_rejected() -> None:
    with pytest.raises(ValidationError):
        PurchaseIngestedEvent(**{**_VALID_PAYLOAD, "status": "pending_user_edit"})


def test_overall_confidence_bounds() -> None:
    with pytest.raises(ValidationError):
        PurchaseIngestedEvent(**{**_VALID_PAYLOAD, "overall_confidence": 1.5})
    with pytest.raises(ValidationError):
        PurchaseIngestedEvent(**{**_VALID_PAYLOAD, "overall_confidence": -0.1})


def test_extra_fields_rejected() -> None:
    with pytest.raises(ValidationError):
        EventEnvelope.model_validate({"schema_version": 1, "bogus": True})
