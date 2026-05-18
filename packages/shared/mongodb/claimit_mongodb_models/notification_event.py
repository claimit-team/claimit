"""NotificationEvent collection — tracks user-facing notification events."""

from typing import Any
from uuid import UUID

from .base import BaseDocument
from .enums import NotificationEntityType, NotificationEventType


class NotificationEvent(BaseDocument):
    user_id: UUID
    event_type: NotificationEventType
    entity_type: NotificationEntityType | None
    entity_id: UUID | None = None
    data: dict[str, Any]
    acknowledged: bool = False
    acknowledged_at: str | None = None
    surfaced_at: str | None = None
    created_at: str
