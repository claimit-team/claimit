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
    Category,
    MongoDBClient,
    Platform,
    PriceHistory,
    PriceSource,
    Purchase,
    PurchaseReadTolerant,
)
from claimit_observability import get_tracer, span_with_attributes

from .adapters.base import PriceFetchError, PriceSnapshot
from .adapters.config import get_adapter
from .cadence import compute_target_cadence_minutes, is_due
from .comparison import compare_prices
from .eligibility import validate_eligibility

logger = logging.getLogger(__name__)
tracer = get_tracer(__name__)

# Soft ceiling on the per-run scan size. Demo scale is well below this.
_SCAN_LIMIT = 1000


def _as_utc_aware(value: datetime) -> datetime:
    """Treat naive MongoDB datetimes as UTC and convert aware values to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _is_degraded(purchase: PurchaseReadTolerant) -> str | None:
    """Return a human-readable reason if `purchase` is missing fields the
    cron sweep depends on, or `None` if it's processable.

    The §1 audit (PR #141 follow-up) found one rogue Purchase in prod
    with `category=None`, `product_name=None`, `claim_type=None`. With
    `db.find_purchases` now returning `PurchaseReadTolerant`, that doc
    no longer 500s deserialization — but the cron's cadence, adapter,
    price-comparison, and eligibility paths expect several fields to be
    present and internally consistent. Skip such docs with a logged
    warning so the rest of the sweep continues.
    """
    if purchase.id is None:
        return "null _id (impossible from Mongo, but be defensive)"
    if purchase.window_expires is None:
        return "null window_expires"
    # Cadence must be > 0. With tolerant reads, a stored 0 / negative
    # value would slip past `is None` and feed into `is_due`, which uses
    # `last_checked_at + cadence_minutes <= now` — for cadence <= 0 that
    # comparison is always true, tight-looping the sweep on the same
    # purchase. Treat <=0 the same way we treat null: skip + warn.
    if purchase.monitoring_cadence_minutes is None or purchase.monitoring_cadence_minutes <= 0:
        return f"non-positive monitoring_cadence_minutes {purchase.monitoring_cadence_minutes!r}"
    if purchase.price_paid is None:
        return "null price_paid"
    if purchase.price_paid <= 0:
        return f"non-positive price_paid {purchase.price_paid!r}"
    if purchase.platform is None:
        return "null platform"
    try:
        Platform(purchase.platform)
    except ValueError:
        return f"unknown platform {purchase.platform!r}"
    if purchase.category is None:
        return "null category"
    try:
        category = Category(purchase.category)
    except ValueError:
        return f"unknown category {purchase.category!r}"
    if not purchase.product_id:
        return "null/empty product_id"
    if category == Category.HOTEL:
        if purchase.purchase_date is None:
            return "null hotel purchase_date"
        if purchase.purchase_date_basis != "check_in_date":
            return f"invalid hotel purchase_date_basis {purchase.purchase_date_basis!r}"
    return None


async def run_cron(db: MongoDBClient) -> dict[str, int]:
    """Run one cadence sweep. Returns counter summary; always finishes successfully."""
    now = datetime.now(UTC)
    scanned = due_count = fetched = errors = skipped_expired = skipped_source = 0
    skipped_degraded = 0
    eligible = ineligible = no_policy = 0

    purchases = await db.find_purchases({"status": "monitoring"}, limit=_SCAN_LIMIT)

    with span_with_attributes(tracer, "cron.run", {"purchases.scanned": len(purchases)}):
        for purchase in purchases:
            scanned += 1
            # Skip degraded docs (legacy/rogue rows where required cron
            # inputs are null or carry an unknown enum value). Emitting
            # a warning + skipping per-row is the §4 contract — never
            # abort the whole sweep on one bad doc.
            degraded_reason = _is_degraded(purchase)
            if degraded_reason is not None:
                skipped_degraded += 1
                logger.warning(
                    "cron.skip_degraded purchase_id=%s reason=%s",
                    purchase.id,
                    degraded_reason,
                )
                continue

            # The non-null guarantees below are established by `_is_degraded`.
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
                try:
                    await db.partial_update(
                        "purchases",
                        purchase.id,
                        {"monitoring_cadence_minutes": target_cadence},
                        Purchase,
                    )
                    purchase.monitoring_cadence_minutes = target_cadence
                except Exception:
                    errors += 1
                    logger.exception("cron.cadence_update_error purchase_id=%s", purchase.id)
                    # Leave in-memory cadence at the stored value so is_due uses
                    # the value the DB still has; next tick will retry the drift.
                    continue

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
                # `purchase.platform` is the raw string (validated by
                # `_is_degraded` to map to the Platform enum) and
                # `product_id` is non-empty by the same gate.
                platform_value = purchase.platform
                with span_with_attributes(
                    tracer,
                    "cron.fetch",
                    {
                        "purchase.id": str(purchase.id),
                        "purchase.platform": platform_value,
                    },
                ):
                    adapter = get_adapter(platform_value)
                    snap = await adapter.fetch_current_price(
                        platform=platform_value,
                        product_id=purchase.product_id,
                        product_url=purchase.product_url,
                        member_tier=purchase.member_tier_at_purchase,
                    )
                fetched += 1
                if not await _persist_price_history(db, purchase, snap):
                    skipped_source += 1

                # Eligibility decision. compare_prices is the tier-aware
                # has-drop gate from 3.10; validate_eligibility encodes
                # the full §5.4 rules engine on top of it (window, bundle,
                # loyalty, award, basic-economy, identical-room, ...).
                # The actual claim-draft write + price.dropped Pub/Sub
                # are ticket 3.12 — here we only count and log.
                comparison = compare_prices(purchase, snap)
                if not comparison.is_eligible:
                    # No drop, or tier-match precondition failed.
                    # Already counted under `fetched`; no further bookkeeping.
                    continue
                policy = await db.get_policy(purchase.platform)
                if policy is None:
                    no_policy += 1
                    logger.warning(
                        "cron.no_policy purchase_id=%s platform=%s",
                        purchase.id,
                        purchase.platform,
                    )
                    continue
                result = validate_eligibility(purchase, policy, snap, comparison, now=now)
                if result.eligible:
                    eligible += 1
                    logger.info(
                        "cron.eligible purchase_id=%s drop_pct=%.2f drop_amount=%.2f",
                        purchase.id,
                        comparison.drop_percentage,
                        comparison.drop_amount,
                    )
                else:
                    ineligible += 1
                    logger.info(
                        "cron.ineligible purchase_id=%s code=%s reason=%s",
                        purchase.id,
                        result.code,
                        result.reason,
                    )
            except PriceFetchError as exc:
                errors += 1
                logger.warning("cron.fetch_error purchase_id=%s reason=%s", purchase.id, exc.reason)
            except Exception:
                errors += 1
                logger.exception("cron.unexpected_error purchase_id=%s", purchase.id)
            finally:
                # Always bump last_checked_at — even on adapter error — to avoid
                # hot-looping a permanently broken adapter on every 15-min tick.
                # A failure here must not abort the sweep; the next tick will
                # observe last_checked_at unchanged and naturally retry.
                try:
                    await db.partial_update(
                        "purchases", purchase.id, {"last_checked_at": now}, Purchase
                    )
                except Exception:
                    errors += 1
                    logger.exception("cron.last_checked_update_error purchase_id=%s", purchase.id)

    summary = {
        "scanned": scanned,
        "due": due_count,
        "fetched": fetched,
        "errors": errors,
        "skipped_expired": skipped_expired,
        "skipped_source": skipped_source,
        "skipped_degraded": skipped_degraded,
        "eligible": eligible,
        "ineligible": ineligible,
        "no_policy": no_policy,
    }
    logger.info(
        "cron.summary scanned=%d due=%d fetched=%d errors=%d "
        "skipped_expired=%d skipped_source=%d skipped_degraded=%d "
        "eligible=%d ineligible=%d no_policy=%d",
        scanned,
        due_count,
        fetched,
        errors,
        skipped_expired,
        skipped_source,
        skipped_degraded,
        eligible,
        ineligible,
        no_policy,
    )
    return summary


async def _persist_price_history(
    db: MongoDBClient,
    purchase: PurchaseReadTolerant,
    snap: PriceSnapshot,
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
