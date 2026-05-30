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

Compound watermark (created_at, _id):
- Tracking only `created_at` is unsafe at the 50-doc batch boundary: if
  two notifications share the same created_at and one straddles the
  batch limit, the next tick's `$gt: last_seen_iso` filter would drop
  the rest of that timestamp's docs forever. Same bug family as the
  cursor pagination tie-break in services/notifications.py — applied the
  same $or compound predicate fix here.
- First poll has no _id watermark yet (last_seen_id is None), so we use
  a plain `created_at $gt now()` filter; subsequent polls use the
  compound `[created_at $gt last_iso, OR (created_at == last_iso AND
  _id $gt last_id)]` predicate.
- Sort is `created_at` ASC, `_id` ASC so the watermark advance is
  consistent with the read order.

Safety cap:
- Each tick fetches at most 50 docs. If a user has a backlog of > 50
  events accumulated between polls, the watermark advances by one batch
  and the rest are picked up on the next tick.

Error handling — two layers:
- A DB error during the poll itself emits an `error` SSE frame and the
  generator continues on the next poll cycle. Transient connection
  blips do not tear down the stream.
- A failure inside the per-doc validate/serialize/yield path (Pydantic
  ValidationError from a schema-drift document, etc.) is caught
  per-doc, logged, and the watermark is best-effort advanced past the
  poison doc so we don't replay it forever. The connection stays open.
"""

from __future__ import annotations

import asyncio
import contextlib
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

# Separator for the composite SSE `id:` field. created_at ISO strings and
# UUIDs never contain a pipe, so a single `|` round-trips unambiguously.
_EVENT_ID_SEP = "|"


def format_event_id(created_at: str, event_id: UUID) -> str:
    """Compose the SSE `id:` value from the (created_at, _id) watermark.

    The client echoes this back as `last_event_id` (or the Last-Event-ID
    header) on reconnect so the next stream resumes exactly past the last
    delivered event instead of from now().
    """
    return f"{created_at}{_EVENT_ID_SEP}{event_id}"


def parse_event_id(raw: str) -> tuple[str, UUID] | None:
    """Inverse of format_event_id. Returns (created_at_iso, _id) or None.

    None means the value is unusable (no separator or a non-UUID id) — the
    caller falls back to now() rather than replaying the user's full
    history or crashing the stream.
    """
    created_at, sep, id_part = raw.rpartition(_EVENT_ID_SEP)
    if not sep or not created_at:
        return None
    try:
        return created_at, UUID(id_part)
    except ValueError:
        return None


async def event_stream_generator(
    db: MongoDBClient,
    user_id: UUID,
    last_event_id: str | None = None,
) -> AsyncIterator[dict[str, str]]:
    """Yield SSE-formatted event dicts for `user_id` indefinitely.

    Each dict has `event` (str), `data` (JSON-encoded str), and `id` (the
    composite created_at|_id watermark). The route layer hands these to
    sse_starlette.EventSourceResponse, which emits them as `id:` /
    `event:` / `data:` lines on the wire.

    Resume (`last_event_id`):
    - On a fresh connection (no last_event_id) the watermark starts at
      now(), so the client only receives events created after it connects
      — we never replay the full backlog.
    - On a reconnect the client passes the last delivered event id back.
      We seed the watermark from it so events written during the
      disconnect gap (token-refresh reconnect, network blip) are delivered
      rather than skipped. A malformed value degrades to the now() path.

    Loop: poll notification_events newer than the (created_at, _id)
    watermark, emit each new doc (oldest first), sleep, repeat.
    Disconnects propagate via asyncio.CancelledError raised by
    sse_starlette when the client closes the underlying response.
    """
    resumed = parse_event_id(last_event_id) if last_event_id else None
    if resumed is not None:
        last_seen_iso, last_seen_id = resumed
    else:
        last_seen_iso = datetime.now(UTC).isoformat()
        last_seen_id = None

    while True:
        try:
            new_docs = await _fetch_new_notifications(db, user_id, last_seen_iso, last_seen_id)
        except Exception:
            logger.exception("event_stream poll failed for user_id=%s", user_id)
            yield {
                "event": "error",
                "data": json.dumps({"message": "Stream temporarily unavailable"}),
            }
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            continue

        for raw in new_docs:
            try:
                event = NotificationEvent.model_validate(raw)
                payload = event.model_dump(mode="json", by_alias=True)
                yield {
                    "event": "notification",
                    "data": json.dumps(payload),
                    "id": format_event_id(event.created_at, event.id),
                }
                last_seen_iso = event.created_at
                last_seen_id = event.id
            except Exception:
                logger.exception(
                    "event_stream serialize/yield failed user_id=%s doc_id=%s",
                    user_id,
                    raw.get("_id"),
                )
                # Best-effort watermark advance so a poison doc doesn't
                # get replayed on every poll. Use the raw fields rather
                # than the (failed) Pydantic instance.
                raw_created_at = raw.get("created_at")
                if isinstance(raw_created_at, str):
                    last_seen_iso = raw_created_at
                raw_id = raw.get("_id")
                if isinstance(raw_id, UUID):
                    last_seen_id = raw_id
                elif isinstance(raw_id, str):
                    # _id wasn't UUID-shaped; leave watermark alone. The
                    # compound predicate still skips the poison doc on the
                    # next poll once a later created_at lands.
                    with contextlib.suppress(ValueError):
                        last_seen_id = UUID(raw_id)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def _fetch_new_notifications(
    db: MongoDBClient,
    user_id: UUID,
    last_seen_iso: str,
    last_seen_id: UUID | None,
) -> list[dict[str, Any]]:
    """Return up to MAX_DOCS_PER_TICK notifications newer than the
    (last_seen_iso, last_seen_id) watermark.

    First poll has no _id watermark (last_seen_id is None); use a plain
    `created_at $gt last_seen_iso` filter. Subsequent polls use the
    compound `$or` predicate so docs sharing the boundary timestamp are
    not silently dropped.
    """
    if last_seen_id is None:
        match: dict[str, Any] = {
            "user_id": user_id,
            "created_at": {"$gt": last_seen_iso},
        }
    else:
        match = {
            "user_id": user_id,
            "$or": [
                {"created_at": {"$gt": last_seen_iso}},
                {"created_at": last_seen_iso, "_id": {"$gt": last_seen_id}},
            ],
        }

    pipeline = [
        {"$match": match},
        {"$sort": {"created_at": 1, "_id": 1}},
        {"$limit": MAX_DOCS_PER_TICK},
    ]
    return await db.aggregate("notification_events", pipeline)
