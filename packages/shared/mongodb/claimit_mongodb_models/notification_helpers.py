"""Helper for writing NotificationEvent documents idempotently."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from .client import MongoDBClient
from .enums import NotificationEntityType, NotificationEventType
from .notification_event import NotificationEvent

logger = logging.getLogger(__name__)


async def write_notification_event(
    db: MongoDBClient,
    user_id: str,
    event_type: NotificationEventType,
    entity_type: NotificationEntityType | None,
    entity_id: str | None,
    data: dict[str, Any],
) -> str | None:
    try:
        minute_bucket = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M")
        derived_id = uuid5(
            NAMESPACE_URL,
            f"notification:{user_id}:{event_type}:{entity_id or ''}:{minute_bucket}",
        )

        existing = await db.find_one("notification_events", {"_id": derived_id}, NotificationEvent)
        if existing is not None:
            logger.debug("NotificationEvent already exists: %s", derived_id)
            return str(existing.id)

        doc = NotificationEvent(
            _id=derived_id,
            user_id=UUID(user_id),
            event_type=event_type,
            entity_type=entity_type,
            entity_id=UUID(entity_id) if entity_id is not None else None,
            data=data,
            created_at=datetime.now(UTC).isoformat(),
        )
        return await db.upsert_notification_event(doc)
    except Exception:
        logger.error("Failed to write notification event: user=%s type=%s", user_id, event_type)
        return None
