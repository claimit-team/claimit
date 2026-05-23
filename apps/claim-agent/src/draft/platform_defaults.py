"""Per-platform claim-email defaults for Type A (email) draft generation.

Policies may omit `claim_email` in seed/dev; redraft and first-time drafting
must degrade to a usable address instead of raising DraftGenerationError.
"""

from __future__ import annotations

import logging
import re

from claimit_mongodb_models import Policy

_log = logging.getLogger(__name__)

# Realistic support inboxes for seeded email platforms and demo fixtures.
PLATFORM_CLAIM_EMAILS: dict[str, str] = {
    "amazon": "price-adjustments@amazon.com",
    "best_buy": "pricematch@bestbuy.com",
    "delta": "refunds@delta.com",
    "hilton": "reservations@hilton.com",
    "marriott": "guestservices@marriott.com",
    "southwest": "pricematch@southwest.com",
    "target": "pricematch@target.com",
    "united": "refunds@united.com",
    "walmart": "pricematch@walmart.com",
    "alaska": "pricematch@alaskaair.com",
    "costco": "pricematch@costco.com",
    "crutchfield": "support@crutchfield.com",
    "dell": "pricematch@dell.com",
    "home_depot": "pricematch@homedepot.com",
    "hyatt": "pricematch@hyatt.com",
    "ihg": "pricematch@ihg.com",
    "jetblue": "pricematch@jetblue.com",
    "lowes": "pricematch@lowes.com",
    "macys": "pricematch@macys.com",
    "newegg": "support@newegg.com",
    "nordstrom": "pricematch@nordstrom.com",
    "wyndham": "pricematch@wyndhamhotels.com",
}

_GENERIC_DOMAIN = "example.com"


def _normalize_platform_key(platform: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", platform.strip().lower()).strip("_")


def resolve_claim_email(platform: str, policy: Policy) -> str:
    """Return a claim submission email for Type A drafts.

    Priority: policy.claim_email → known platform default → generic fallback.
    Never raises — unconfigured platforms still produce a draft.
    """
    configured = (policy.claim_email or "").strip()
    if configured:
        return configured

    platform_key = _normalize_platform_key(platform)
    known = PLATFORM_CLAIM_EMAILS.get(platform_key)
    if known:
        _log.info(
            "Using default claim email for platform %r: %s",
            platform,
            known,
        )
        return known

    fallback = f"priceadjustments@{platform_key or 'merchant'}.{_GENERIC_DOMAIN}"
    _log.warning(
        "No claim email configured for platform %r; using generic fallback %s",
        platform,
        fallback,
    )
    return fallback
