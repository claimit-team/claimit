"""Idempotency gate for claim.redraft_requested Pub/Sub redeliveries."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from claimit_mongodb_models.client import MongoDBClient

_log = logging.getLogger(__name__)

COLLECTION = "redraft_processed_events"


async def try_claim_redraft_event(
    db: MongoDBClient,
    *,
    event_id: str,
    claim_id: str,
) -> bool:
    """Insert-once gate. Returns True if this delivery should proceed."""
    return await db.try_insert_idempotency_record(
        COLLECTION,
        event_id,
        {
            "claim_id": claim_id,
            "status": "processing",
            "created_at": datetime.now(UTC),
        },
    )


async def mark_redraft_event_done(
    db: MongoDBClient,
    *,
    event_id: str,
    version: int,
) -> None:
    await db.update_idempotency_record(
        COLLECTION,
        event_id,
        {"status": "done", "version": version, "completed_at": datetime.now(UTC)},
    )
