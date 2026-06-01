"""Resolution orchestrator + persist/notify glue.

``resolve_product_url`` is the pure decision function (no DB, no notifications)
— testable in isolation. ``_resolve_and_persist`` wraps it with the MongoDB
write + NotificationEvent, and is shared by the Pub/Sub handler (primary,
notifies on every outcome) and the cron lazy safety-net (does NOT re-notify
the unresolved case every 15-min tick — the cron ``missing_product_url`` badge
already covers that).
"""

from __future__ import annotations

import asyncio
import logging
import re

from claimit_mongodb_models import (
    NotificationEntityType,
    NotificationEventType,
    Purchase,
    write_notification_event,
)

from .base import ResolveError, ResolveResult, Scenario
from .config import (
    MIN_CONFIDENCE,
    PRICE_BOUND_HIGH,
    PRICE_BOUND_LOW,
    RESOLVABLE_PLATFORMS,
    get_resolver,
)

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9]+")

_SCENARIO_TO_EVENT = {
    Scenario.RESOLVED: NotificationEventType.PRODUCT_URL_RESOLVED,
    Scenario.CORRECTED: NotificationEventType.PRODUCT_URL_CORRECTED,
    Scenario.UNRESOLVED_HAD_URL: NotificationEventType.PRODUCT_URL_UNRESOLVED,
    Scenario.UNRESOLVED_BLANK: NotificationEventType.PRODUCT_URL_UNRESOLVED,
}


def _tokens(text: str | None) -> set[str]:
    return set(_TOKEN_RE.findall((text or "").lower()))


def _name_overlap(product_name: str, title: str | None) -> float:
    """Jaccard overlap of name vs candidate title tokens (0..1)."""
    a, b = _tokens(product_name), _tokens(title)
    if not a or not b:
        return 0.6  # no title to compare (e.g. Best Buy SERP) — neutral prior
    return len(a & b) / len(a | b)


def _price_in_bounds(price_paid: float, listed_price: float | None) -> bool:
    """True unless the candidate price is grossly off the price paid."""
    if listed_price is None or price_paid <= 0:
        return True  # unknown — pass through
    return PRICE_BOUND_LOW * price_paid <= listed_price <= PRICE_BOUND_HIGH * price_paid


async def resolve_product_url(
    platform: str,
    product_name: str,
    price_paid: float,
    existing_url: str | None,
) -> ResolveResult:
    """Decide the product URL for a purchase. Pure (no DB / no notifications)."""
    resolver = get_resolver(platform)
    if resolver is None:
        return ResolveResult(None, Scenario.UNRESOLVED_BLANK, 0.0)

    # Idempotency: a URL that is already on-host + well-formed is left alone.
    if existing_url and resolver.host_ok(existing_url) and resolver.is_product_url(existing_url):
        return ResolveResult(existing_url, Scenario.ALREADY_VALID, 1.0)

    try:
        candidates = await asyncio.to_thread(resolver.resolve, product_name, price_paid)
    except ResolveError:
        logger.warning("resolver.transport_error platform=%s", platform)
        candidates = []

    for index, candidate in enumerate(candidates):
        if not _price_in_bounds(price_paid, candidate.listed_price):
            continue
        overlap = _name_overlap(product_name, candidate.title)
        confidence = max(0.0, min(1.0, overlap - 0.05 * index))
        scenario = Scenario.CORRECTED if existing_url else Scenario.RESOLVED
        return ResolveResult(
            url=candidate.url,
            scenario=scenario,
            confidence=confidence,
            candidate_price=candidate.listed_price,
            candidate_id=candidate.product_id,
        )

    scenario = Scenario.UNRESOLVED_HAD_URL if existing_url else Scenario.UNRESOLVED_BLANK
    return ResolveResult(None, scenario, 0.0)


async def _resolve_and_persist(db, purchase, *, notify_unresolved: bool = True) -> ResolveResult:
    """Resolve, persist a found URL, and write the scenario notification.

    Shared by the ``/pubsub/purchase.ingested`` handler and the cron lazy
    resolve. Mutates ``purchase.product_url`` in-memory on success so a cron
    tick can proceed to fetch in the same pass.
    """
    platform = purchase.platform
    if platform not in RESOLVABLE_PLATFORMS or not purchase.product_name:
        return ResolveResult(None, Scenario.UNRESOLVED_BLANK, 0.0)

    result = await resolve_product_url(
        platform=platform,
        product_name=purchase.product_name,
        price_paid=purchase.price_paid or 0.0,
        existing_url=purchase.product_url,
    )

    if result.scenario is Scenario.ALREADY_VALID:
        return result

    had_url = bool(purchase.product_url)
    event_type = _SCENARIO_TO_EVENT[result.scenario]
    data: dict = {
        "platform": platform,
        "product_name": purchase.product_name,
        "scenario": result.scenario.value,
        "had_url": had_url,
    }

    if result.url is not None:
        try:
            await db.partial_update(
                "purchases",
                purchase.id,
                {
                    "product_url": result.url,
                    "last_monitor_error": None,
                    "last_monitor_error_at": None,
                    "last_monitor_error_code": None,
                },
                Purchase,
            )
            purchase.product_url = result.url
        except Exception:
            logger.exception("resolver.persist_failed purchase_id=%s", purchase.id)
            # Clear url so callers (cron counters / pubsub handler) don't count
            # a DB failure as a successful resolve.
            return ResolveResult(
                url=None,
                scenario=result.scenario,
                confidence=result.confidence,
                candidate_price=result.candidate_price,
                candidate_id=result.candidate_id,
            )
        data["product_url"] = result.url
        data["confidence"] = round(result.confidence, 3)
        data["low_confidence"] = result.confidence < MIN_CONFIDENCE
        logger.info(
            "resolver.resolved purchase_id=%s scenario=%s confidence=%.2f",
            purchase.id,
            result.scenario.value,
            result.confidence,
        )
        await write_notification_event(
            db,
            user_id=str(purchase.user_id),
            event_type=event_type,
            entity_type=NotificationEntityType.PURCHASE,
            entity_id=str(purchase.id),
            data=data,
        )
        return result

    # Unresolved — leave product_url null; the cron missing_product_url path
    # remains the in-app "Add product URL" affordance.
    logger.info(
        "resolver.unresolved purchase_id=%s scenario=%s had_url=%s",
        purchase.id,
        result.scenario.value,
        had_url,
    )
    if notify_unresolved:
        await write_notification_event(
            db,
            user_id=str(purchase.user_id),
            event_type=event_type,
            entity_type=NotificationEntityType.PURCHASE,
            entity_id=str(purchase.id),
            data=data,
        )
    return result
