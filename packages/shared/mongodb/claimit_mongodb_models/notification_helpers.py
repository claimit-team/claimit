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
    """Idempotent write of an in-app NotificationEvent + best-effort email fan-out.

    Email fan-out (BUG-124 Phase 1) is lazy-imported from `claimit_notifier`
    so services that haven't wired the optional dep keep writing Mongo docs
    cleanly. ANY failure in the fan-out (import error, missing user, send
    failure) is swallowed — the in-app notification is the source of truth
    and must not be blocked by a downstream channel.
    """
    was_inserted = False
    try:
        minute_bucket = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M")
        derived_id = uuid5(
            NAMESPACE_URL,
            f"notification:{user_id}:{event_type}:{entity_id or ''}:{minute_bucket}",
        )

        doc = NotificationEvent(
            _id=derived_id,
            user_id=UUID(user_id),
            event_type=event_type,
            entity_type=entity_type,
            entity_id=UUID(entity_id) if entity_id is not None else None,
            data=data,
            created_at=datetime.now(UTC).isoformat(),
        )
        upsert_id, was_inserted = await db.upsert_notification_event(doc)
    except Exception:
        logger.error("Failed to write notification event: user=%s type=%s", user_id, event_type)
        return None

    # Dedup gate: only fan-out on a real insert. A duplicate hit
    # (concurrent Pub/Sub redeliver, retry storm) returns the same id but
    # was_inserted=False, so we skip the email and avoid sending twice.
    if not was_inserted:
        logger.debug("NotificationEvent already existed (no fan-out): %s", upsert_id)
        return upsert_id

    # ── Email fan-out (best-effort, post-upsert) ─────────────────────────
    # Awaited (not fire-and-forget) so SendGrid latency is included in the
    # caller's response time, but a SendGrid blip cannot drop the email
    # silently the way asyncio.create_task can if the task is cancelled
    # at request shutdown. Total added latency budget: 8s per
    # sendgrid_client.send_email's httpx timeout.
    try:
        from claimit_notifier import EMAILED_EVENT_TYPES, dispatch_email_for_notification

        # Cheap event-type pre-check BEFORE the get_user DB round-trip.
        # Most NotificationEvents (price_dropped, low_confidence_extract,
        # claim_denied, …) are not in scope for Phase 1 emails; skip the
        # user lookup entirely for those.
        if event_type not in EMAILED_EVENT_TYPES:
            return upsert_id

        user = await db.get_user(user_id)
        await dispatch_email_for_notification(
            user=user,
            event_type=event_type,
            entity_id=entity_id,
            data=data,
        )
    except ImportError:
        # Service doesn't have the optional notifier package wired — fine.
        # Means this service doesn't emit the three Phase 1 events (or the
        # dep wasn't added yet). Skip silently; in-app write succeeded.
        pass
    except Exception:
        # Any other failure inside the dispatcher path. Dispatcher itself
        # swallows SendGrid errors internally; this catches the user-lookup
        # or other unexpected paths so the writer return value stays clean.
        logger.exception(
            "notifier.dispatch_unexpected_error user=%s type=%s",
            user_id,
            event_type,
        )

    return upsert_id
