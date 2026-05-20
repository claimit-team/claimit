"""Ingest pipeline: extract → insert → publish `purchase.ingested`.

`extract()` stays pure (validates + dedup-reads); this orchestrator owns the
side effects so the extractor remains easy to test and reuse from other
transports (e.g. a future HTTP endpoint or Pub/Sub-push handler).
"""

from __future__ import annotations

import logging
from typing import Any

from claimit_pubsub import TOPIC_PURCHASE_INGESTED, PurchaseIngestedEvent, publish_event

from src.extractor import EmailForExtraction, extract

logger = logging.getLogger(__name__)

PUBLISHABLE_STATUSES = frozenset({"monitoring", "pending_confirmation"})


async def ingest_email(
    email: EmailForExtraction | dict[str, Any],
    *,
    purchases_collection: Any,
    user_email: str | None = None,
    gmail_refresh_token_ref: str | None = None,
    gmail_connected_email: str | None = None,
) -> dict[str, Any]:
    """Extract, persist, and publish a single order email.

    Raises `DuplicateReceiptError` from `extract()` when a matching
    `receipt_hash` already exists — no insert, no publish.
    """
    purchase = await extract(
        email,
        purchases_collection=purchases_collection,
        user_email=user_email,
        gmail_refresh_token_ref=gmail_refresh_token_ref,
        gmail_connected_email=gmail_connected_email,
    )
    await purchases_collection.insert_one(purchase)

    status = purchase["status"]
    if status not in PUBLISHABLE_STATUSES:
        logger.info(
            "Skipping purchase.ingested publish for status=%s purchase_id=%s",
            status,
            purchase["_id"],
        )
        return purchase

    event = PurchaseIngestedEvent(
        user_id=str(purchase["user_id"]),
        purchase_id=str(purchase["_id"]),
        platform=purchase["platform"],
        category=purchase["category"],
        status=status,
        ingestion_source=purchase["ingestion_source"],
        overall_confidence=purchase["extraction_confidence"]["overall_min"],
    )
    await publish_event(TOPIC_PURCHASE_INGESTED, event)
    return purchase
