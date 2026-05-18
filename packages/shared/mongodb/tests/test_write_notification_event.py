"""Tests for write_notification_event helper."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from claimit_mongodb_models import (
    NotificationEntityType,
    NotificationEventType,
    write_notification_event,
)

_USER_ID = "11111111-1111-4111-8111-111111111111"
_ENTITY_ID = "55555555-5555-4555-8555-555555555555"
_DATA = {"claim_id": _ENTITY_ID, "claim_type": "self_service"}


def _make_db(existing: object = None, upsert_return: str = "persisted-id") -> AsyncMock:
    db = AsyncMock()
    db.find_one.return_value = existing
    db.upsert_notification_event.return_value = upsert_return
    return db


# ---------------------------------------------------------------------------
# Successful write
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_successful_write_returns_uuid_string() -> None:
    expected_id = str(uuid4())
    db = _make_db(existing=None, upsert_return=expected_id)

    result = await write_notification_event(
        db=db,
        user_id=_USER_ID,
        event_type=NotificationEventType.CLAIM_DRAFTED,
        entity_type=NotificationEntityType.CLAIM,
        entity_id=_ENTITY_ID,
        data=_DATA,
    )

    assert result == expected_id
    db.find_one.assert_called_once()
    db.upsert_notification_event.assert_called_once()


# ---------------------------------------------------------------------------
# Idempotency — duplicate within same minute
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_returns_existing_id_without_double_write() -> None:
    existing_id = uuid4()
    existing = MagicMock()
    existing.id = existing_id
    db = _make_db(existing=existing)

    result = await write_notification_event(
        db=db,
        user_id=_USER_ID,
        event_type=NotificationEventType.CLAIM_DRAFTED,
        entity_type=NotificationEntityType.CLAIM,
        entity_id=_ENTITY_ID,
        data=_DATA,
    )

    assert result == str(existing_id)
    db.upsert_notification_event.assert_not_called()


# ---------------------------------------------------------------------------
# DB failure — returns None, never raises
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_db_failure_returns_none_without_raising() -> None:
    db = AsyncMock()
    db.find_one.side_effect = Exception("connection refused")

    result = await write_notification_event(
        db=db,
        user_id=_USER_ID,
        event_type=NotificationEventType.CLAIM_DRAFTED,
        entity_type=NotificationEntityType.CLAIM,
        entity_id=None,
        data={},
    )

    assert result is None
