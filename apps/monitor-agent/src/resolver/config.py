"""Resolver routing + tunables.

Mirrors the lazy-import routing in ``adapters/config.py``: only platforms with
a live ScraperAPI price adapter are resolvable, and resolver classes are
imported lazily so a missing scraper dep never breaks module import.
"""

from __future__ import annotations

from .base import ProductUrlResolver

# Platforms whose live price adapters require an on-host product_url and which
# we can resolve via ScraperAPI today (the live retail hero platforms).
RESOLVABLE_PLATFORMS = {"best_buy", "target"}

# Below this confidence we still persist the best-effort URL but flag the
# notification so the user is nudged to confirm/correct it.
MIN_CONFIDENCE = 0.5

# A resolved candidate whose own listed price is wildly off the price the user
# paid is almost certainly the wrong product. Allow a generous band (prices do
# drop — that's the whole point) but reject gross mismatches.
PRICE_BOUND_LOW = 0.3
PRICE_BOUND_HIGH = 3.0


def get_resolver(platform: str) -> ProductUrlResolver | None:
    """Return the resolver for ``platform``, or ``None`` if not resolvable."""
    if platform == "best_buy":
        from .best_buy import BestBuyResolver

        return BestBuyResolver()
    if platform == "target":
        from .target import TargetResolver

        return TargetResolver()
    return None
