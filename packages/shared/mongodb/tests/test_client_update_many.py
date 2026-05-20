"""Tests for MongoDBClient.update_many()."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient, NotificationEvent
from pydantic import ValidationError


def _client_with_modified_count(modified_count: int) -> tuple[MongoDBClient, MagicMock]:
    """Build a MongoDBClient with a stubbed _db whose update_many returns
    a result object with the given modified_count. Returns the client and
    the inner collection mock for inspection."""
    client = MongoDBClient.__new__(MongoDBClient)  # bypass __init__
    update_result = MagicMock()
    update_result.modified_count = modified_count
    collection_mock = MagicMock()
    collection_mock.update_many = AsyncMock(return_value=update_result)
    db_mock = MagicMock()
    db_mock.__getitem__ = MagicMock(return_value=collection_mock)
    client._db = db_mock  # type: ignore[attr-defined]
    return client, collection_mock


@pytest.mark.asyncio
async def test_update_many_returns_modified_count_and_sets_updated_at() -> None:
    """Happy path: helper passes the filter through, injects updated_at into
    $set, and returns the underlying modified_count."""
    client, collection_mock = _client_with_modified_count(modified_count=3)

    user_id = UUID("00000000-0000-0000-0000-000000000001")
    before = datetime.now(UTC)
    result = await client.update_many(
        "notification_events",
        {"user_id": user_id, "acknowledged": False},
        {"acknowledged": True, "acknowledged_at": "2026-05-19T12:00:00+00:00"},
    )
    after = datetime.now(UTC)

    assert result == 3
    collection_mock.update_many.assert_awaited_once()
    args = collection_mock.update_many.await_args
    assert args.args[0] == {"user_id": user_id, "acknowledged": False}
    set_payload = args.args[1]["$set"]
    assert set_payload["acknowledged"] is True
    assert set_payload["acknowledged_at"] == "2026-05-19T12:00:00+00:00"
    assert isinstance(set_payload["updated_at"], datetime)
    assert before <= set_payload["updated_at"] <= after


@pytest.mark.asyncio
async def test_update_many_rejects_id_in_updates() -> None:
    """Bulk identity rewrites are always a bug — refused before the DB call."""
    client, collection_mock = _client_with_modified_count(modified_count=0)

    with pytest.raises(ValueError, match="_id"):
        await client.update_many("notification_events", {}, {"_id": "anything"})

    collection_mock.update_many.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_many_validates_against_model_when_supplied() -> None:
    """When `model` is supplied, each updates field is validated against its
    model annotation. Invalid values raise before the DB call."""
    client, collection_mock = _client_with_modified_count(modified_count=0)

    # `acknowledged` must be bool; passing a non-bool string trips
    # Pydantic strict-bool via TypeAdapter and raises ValidationError
    # before update_many is called. Asserting on ValidationError directly
    # (rather than the bare Exception) verifies the contract — any other
    # exception type would indicate a regression in the validation path.
    with pytest.raises(ValidationError):
        await client.update_many(
            "notification_events",
            {"user_id": UUID("00000000-0000-0000-0000-000000000001")},
            {"acknowledged": "not-a-bool"},
            model=NotificationEvent,
        )

    collection_mock.update_many.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_many_rejects_unknown_field_when_model_supplied() -> None:
    """Unknown fields surface as ValueError, not a silent passthrough."""
    client, collection_mock = _client_with_modified_count(modified_count=0)

    with pytest.raises(ValueError, match="Unknown field"):
        await client.update_many(
            "notification_events",
            {},
            {"definitely_not_a_field": True},
            model=NotificationEvent,
        )

    collection_mock.update_many.assert_not_awaited()
