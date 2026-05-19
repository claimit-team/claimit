"""Notifications service: aggregation pipeline + ack logic.

See Attachment 2 §3.8 for the endpoint contract.

Design notes:
- list_notifications uses a single aggregation with $facet to return both
  the paginated list and the unread_count in one round-trip.
- unread_count is intentionally NOT scoped by request filters — it's the
  user's total unread (UI badge semantic).
- The query asks the DB for limit+1 docs to determine has-more; we slice to
  `limit` and emit next_cursor from the last visible doc.
- Cursor encoding format matches middleware/pagination.py's existing helpers
  (base64-json {id, sort_key}). sort_key holds the doc's created_at ISO
  string; apply step uses a compound $or predicate so pagination is correct
  when multiple notifications share the same created_at:
  {$or: [{created_at: {$lt: sort_key}}, {created_at: sort_key, _id: {$lt: id}}]}.
  The existing apply_cursor_to_query targets _id-ASC pagination which
  doesn't fit notifications.
- Sort order: created_at DESC, _id DESC. Hits the existing
  user_id_1_created_at_-1 index (and the 3-field
  user_id_1_acknowledged_1_created_at_-1 index for the unread facet).

ack_notification:
- Scopes find_one to {_id, user_id} so a user can't ack another user's
  notification (404 if mismatch, not 403, to avoid leaking existence).
- Idempotent: already-acked notifications are returned unchanged.
  acknowledged_at is preserved.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from claimit_mongodb_models import MongoDBClient, NotificationEvent
from claimit_mongodb_models.enums import NotificationEventType

from ..middleware.errors import ApiError
from ..middleware.pagination import decode_cursor, encode_cursor

_MAX_LIMIT = 100  # mirrored as Query(le=100) in the route handler


async def list_notifications(
    db: MongoDBClient,
    user_id: UUID,
    event_type: NotificationEventType | None,
    acknowledged: bool | None,
    limit: int,
    cursor: str | None,
) -> dict[str, object]:
    """List notifications for `user_id` with optional filters + cursor pagination.

    Returns:
        {
          "notifications": list[dict] (each is a NotificationEvent JSON-dump),
          "next_cursor": str | None,
          "unread_count": int,
        }
    """
    list_match: dict[str, Any] = {}
    if event_type is not None:
        list_match["event_type"] = event_type.value
    if acknowledged is not None:
        list_match["acknowledged"] = acknowledged
    if cursor is not None:
        cursor_id, sort_key = decode_cursor(cursor)
        if sort_key is None:
            raise ApiError(
                "invalid_cursor",
                "Cursor is missing the sort key",
                status_code=400,
            )
        try:
            cursor_uuid = UUID(cursor_id)
        except ValueError as err:
            raise ApiError(
                "invalid_cursor",
                "Cursor contains invalid ID",
                status_code=400,
            ) from err
        list_match["$or"] = [
            {"created_at": {"$lt": sort_key}},
            {"created_at": sort_key, "_id": {"$lt": cursor_uuid}},
        ]

    pipeline: list[dict[str, Any]] = [
        {"$match": {"user_id": user_id}},
        {
            "$facet": {
                "list": [
                    {"$match": list_match} if list_match else {"$match": {}},
                    {"$sort": {"created_at": -1, "_id": -1}},
                    {"$limit": limit + 1},
                ],
                "unread_count": [
                    {"$match": {"acknowledged": False}},
                    {"$count": "count"},
                ],
            }
        },
    ]

    raw_result = await db.aggregate("notification_events", pipeline)
    facet = raw_result[0] if raw_result else {}
    list_docs = facet.get("list", [])
    unread_facet = facet.get("unread_count", [])
    unread_count = int(unread_facet[0]["count"]) if unread_facet else 0

    has_more = len(list_docs) > limit
    visible_docs = list_docs[:limit]

    next_cursor: str | None = None
    if has_more:
        last = visible_docs[-1]
        next_cursor = encode_cursor(
            doc_id=str(last["_id"]),
            sort_key=str(last["created_at"]),
        )

    # Each doc is a raw aggregation dict. Validate it through the model so
    # serialization mirrors what NotificationEvent.model_dump(mode="json")
    # would emit (UUIDs as strings, etc.) — keeps the wire shape consistent
    # with what /:id/ack returns via serialize_notification.
    notifications = [
        NotificationEvent.model_validate(d).model_dump(mode="json", by_alias=True)
        for d in visible_docs
    ]

    return {
        "notifications": notifications,
        "next_cursor": next_cursor,
        "unread_count": unread_count,
    }


async def ack_notification(
    db: MongoDBClient,
    user_id: UUID,
    notification_id: UUID,
) -> NotificationEvent:
    """Mark a notification as acknowledged. Idempotent.

    Raises ApiError(notification_not_found, 404) if:
    - No notification matches notification_id, OR
    - The notification belongs to a different user.
    """
    existing = await db.find_one(
        "notification_events",
        {"_id": notification_id, "user_id": user_id},
        NotificationEvent,
    )
    if existing is None:
        raise ApiError(
            "notification_not_found",
            "Notification not found",
            status_code=404,
        )

    if existing.acknowledged:
        return existing

    now_iso = datetime.now(UTC).isoformat()
    success = await db.partial_update(
        "notification_events",
        notification_id,
        {"acknowledged": True, "acknowledged_at": now_iso},
        model=NotificationEvent,
    )
    if not success:
        # Document deleted between read and write. Race; treat as 404.
        raise ApiError(
            "notification_not_found",
            "Notification not found",
            status_code=404,
        )

    existing.acknowledged = True
    existing.acknowledged_at = now_iso
    return existing
