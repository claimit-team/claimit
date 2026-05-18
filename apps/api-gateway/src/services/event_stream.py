"""SSE event stream: polling-backed async generator.

Why polling and not MongoDB Change Streams or Pub/Sub?
- Cloud Run scales api-gateway to zero (cpu_idle=true) and times each
  request at 300s. A persistent change stream watcher would either pin a
  CPU 24/7 (defeating cpu_idle) or be torn down between requests
  (defeating change streams). Pub/Sub would require fan-out infra not
  yet built (subscriptions per connected user).
- A 1-second poll with the user_id_1_created_at_-1 index is cheap (a
  bounded index range scan) and matches the latency users expect from
  "live" notifications. Easy to swap out later if either alternative
  becomes attractive.

last_seen ordering:
- The generator tracks the latest `created_at` ISO string it has emitted.
  Each tick queries for `created_at > last_seen` and updates the
  watermark from the newest doc returned. This avoids re-emitting
  notifications across polling intervals without needing a server-side
  cursor.
- On first tick we seed last_seen with `datetime.now(UTC).isoformat()`
  so we don't replay the user's history. The route layer can decide
  later to support backfill via query param if the product wants it.

Safety cap:
- Each tick fetches at most 50 docs. If a user has a backlog of > 50
  events accumulated between polls, the watermark advances by one batch
  and the rest are picked up on the next tick. Prevents pathological
  bursts from blowing up a single SSE frame.

Error handling:
- A DB error during a poll is emitted as an `error` SSE event (not a
  notification frame) and the generator continues. Yielding rather than
  raising avoids tearing down the stream on a transient blip and lets
  the client decide how to react.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from claimit_mongodb_models import MongoDBClient, NotificationEvent

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
MAX_DOCS_PER_TICK = 50


async def event_stream_generator(
    db: MongoDBClient,
    user_id: UUID,
) -> AsyncIterator[dict[str, str]]:
    """Yield SSE-formatted event dicts for `user_id` indefinitely.

    Each dict has `event` (str) and `data` (JSON-encoded str). The route
    layer hands these to sse_starlette.EventSourceResponse, which emits
    them as `event:` / `data:` lines on the wire.

    Loop: poll notification_events for created_at > last_seen,
    emit any new ones (oldest first), sleep POLL_INTERVAL_SECONDS,
    repeat. Disconnects propagate via asyncio.CancelledError raised by
    sse_starlette when the client closes the underlying response.
    """
    last_seen_iso: str = datetime.now(UTC).isoformat()

    while True:
        try:
            new_docs = await _fetch_new_notifications(db, user_id, last_seen_iso)
        except Exception:
            logger.exception("event_stream poll failed for user_id=%s", user_id)
            yield {
                "event": "error",
                "data": json.dumps({"message": "Stream temporarily unavailable"}),
            }
        else:
            for doc in new_docs:
                yield {
                    "event": "notification",
                    "data": json.dumps(
                        NotificationEvent.model_validate(doc).model_dump(mode="json", by_alias=True)
                    ),
                }
                created_at = doc.get("created_at")
                if isinstance(created_at, str) and created_at > last_seen_iso:
                    last_seen_iso = created_at

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def _fetch_new_notifications(
    db: MongoDBClient,
    user_id: UUID,
    last_seen_iso: str,
) -> list[dict[str, Any]]:
    """Return up to MAX_DOCS_PER_TICK notifications newer than last_seen.

    Sort is `created_at` ASC + `_id` ASC so a tick that hits the safety
    cap leaves the generator with a deterministic watermark (the most
    recent doc emitted), ready to pick up from on the next tick.
    """
    pipeline = [
        {
            "$match": {
                "user_id": user_id,
                "created_at": {"$gt": last_seen_iso},
            }
        },
        {"$sort": {"created_at": 1, "_id": 1}},
        {"$limit": MAX_DOCS_PER_TICK},
    ]
    return await db.aggregate("notification_events", pipeline)
