"""Cadence-based cron handler for monitor-agent.

Cloud Scheduler invokes `POST /cron` every 15 min. We walk all `status=monitoring`
purchases, recompute each one's cadence from its window-expiry distance, and
fetch prices for any that are due. See `cadence.py` for the ladder.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import uuid4

from claimit_mongodb_models import (
    MongoDBClient,
    PriceHistory,
    PriceSource,
    Purchase,
)
from claimit_observability import get_tracer, span_with_attributes

from .adapters.base import PriceFetchError, PriceSnapshot
from .adapters.config import get_adapter
from .cadence import compute_target_cadence_minutes, is_due

logger = logging.getLogger(__name__)
tracer = get_tracer(__name__)

# Soft ceiling on the per-run scan size. Demo scale is well below this.
_SCAN_LIMIT = 1000


def _as_utc_aware(value: datetime) -> datetime:
    """Treat naive MongoDB datetimes as UTC and convert aware values to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def run_cron(db: MongoDBClient) -> dict[str, int]:
    """Run one cadence sweep. Returns counter summary; always finishes successfully."""
    now = datetime.now(UTC)
    scanned = due_count = fetched = errors = skipped_expired = skipped_source = 0

    purchases = await db.find_purchases({"status": "monitoring"}, limit=_SCAN_LIMIT)

    with span_with_attributes(tracer, "cron.run", {"purchases.scanned": len(purchases)}):
        for purchase in purchases:
            scanned += 1
            purchase.window_expires = _as_utc_aware(purchase.window_expires)
            if purchase.last_checked_at is not None:
                purchase.last_checked_at = _as_utc_aware(purchase.last_checked_at)

            if purchase.window_expires <= now:
                skipped_expired += 1
                logger.info(
                    "cron.skip_expired purchase_id=%s window_expires=%s",
                    purchase.id,
                    purchase.window_expires.isoformat(),
                )
                continue

            target_cadence = compute_target_cadence_minutes(purchase.window_expires, now)
            if target_cadence != purchase.monitoring_cadence_minutes:
                logger.info(
                    "cron.cadence_drift purchase_id=%s old=%d new=%d",
                    purchase.id,
                    purchase.monitoring_cadence_minutes,
                    target_cadence,
                )
                await db.partial_update(
                    "purchases",
                    purchase.id,
                    {"monitoring_cadence_minutes": target_cadence},
                    Purchase,
                )
                purchase.monitoring_cadence_minutes = target_cadence

            days_remaining = (purchase.window_expires - now).total_seconds() / 86400

            if not is_due(purchase, now):
                logger.info(
                    "cron.skip_not_due purchase_id=%s cadence=%d last_checked_at=%s days_remaining=%.2f",
                    purchase.id,
                    target_cadence,
                    purchase.last_checked_at.isoformat() if purchase.last_checked_at else None,
                    days_remaining,
                )
                continue

            due_count += 1
            logger.info(
                "cron.due purchase_id=%s cadence=%d days_remaining=%.2f",
                purchase.id,
                target_cadence,
                days_remaining,
            )

            try:
                with span_with_attributes(
                    tracer,
                    "cron.fetch",
                    {
                        "purchase.id": str(purchase.id),
                        "purchase.platform": purchase.platform.value,
                    },
                ):
                    adapter = get_adapter(purchase.platform.value)
                    snap = await adapter.fetch_current_price(
                        platform=purchase.platform.value,
                        product_id=purchase.product_id,
                        product_url=purchase.product_url,
                        member_tier=purchase.member_tier_at_purchase,
                    )
                fetched += 1
                if not await _persist_price_history(db, purchase, snap):
                    skipped_source += 1
            except PriceFetchError as exc:
                errors += 1
                logger.warning("cron.fetch_error purchase_id=%s reason=%s", purchase.id, exc.reason)
            except Exception:
                errors += 1
                logger.exception("cron.unexpected_error purchase_id=%s", purchase.id)
            finally:
                # Always bump last_checked_at — even on adapter error — to avoid
                # hot-looping a permanently broken adapter on every 15-min tick.
                await db.partial_update(
                    "purchases", purchase.id, {"last_checked_at": now}, Purchase
                )

    summary = {
        "scanned": scanned,
        "due": due_count,
        "fetched": fetched,
        "errors": errors,
        "skipped_expired": skipped_expired,
        "skipped_source": skipped_source,
    }
    logger.info(
        "cron.summary scanned=%d due=%d fetched=%d errors=%d skipped_expired=%d skipped_source=%d",
        scanned,
        due_count,
        fetched,
        errors,
        skipped_expired,
        skipped_source,
    )
    return summary


async def _persist_price_history(
    db: MongoDBClient, purchase: Purchase, snap: PriceSnapshot
) -> bool:
    """Write a PriceHistory row when the adapter's source maps to the enum.

    Returns True if a row was written, False if the source did not map and the
    snapshot was skipped. Seeded snapshots use `source="seeded"`, which is not
    in `PriceSource` today (see issue #110 for the enum expansion); a skip here
    means the price data did not reach history storage, so we log at WARNING.
    """
    try:
        source = PriceSource(snap.source)
    except ValueError:
        logger.warning("cron.price_history_skip source=%s purchase_id=%s", snap.source, purchase.id)
        return False

    record = PriceHistory(
        _id=uuid4(),
        purchase_id=purchase.id,
        platform=purchase.platform,
        product_id=snap.product_id,
        price_member=snap.price_member,
        price_non_member=snap.price_non_member,
        member_tier_required=snap.member_tier_required,
        currency="USD",
        checked_at=snap.checked_at,
        source=source,
        evidence_screenshot_url=snap.evidence_screenshot_url,
        raw_response_hash=snap.raw_response_hash,
    )
    await db.insert_price_history(record)
    return True
