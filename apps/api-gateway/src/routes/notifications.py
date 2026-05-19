"""Notifications endpoints: GET /notifications, POST /notifications/:id/ack.

See Attachment 2 §3.8 for the contract.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from claimit_mongodb_models import MongoDBClient, User
from claimit_mongodb_models.enums import NotificationEventType
from fastapi import APIRouter, Depends, Path, Query

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..serializers import serialize_notification
from ..services import notifications as notifications_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    event_type: Annotated[NotificationEventType | None, Query()] = None,
    acknowledged: Annotated[bool | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query()] = None,
) -> dict[str, object]:
    """Paginated notifications list for the authenticated user.

    Response shape:
        {
          notifications: NotificationEvent[],
          next_cursor: string | null,
          unread_count: number
        }
    """
    return await notifications_service.list_notifications(
        db=db,
        user_id=user.id,
        event_type=event_type,
        acknowledged=acknowledged,
        limit=limit,
        cursor=cursor,
    )


@router.post("/{notification_id}/ack")
async def ack_notification(
    notification_id: Annotated[UUID, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Mark a notification as acknowledged. Idempotent — re-acking returns
    the existing record unchanged (acknowledged_at is preserved)."""
    updated = await notifications_service.ack_notification(
        db=db,
        user_id=user.id,
        notification_id=notification_id,
    )
    return {"notification": serialize_notification(updated)}
