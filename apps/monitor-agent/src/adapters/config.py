"""Feature flag routing for price source adapters.

Env vars:
    PRICE_SOURCE_MODE: "live" | "seeded" | "mixed" (default: "mixed")

In mixed mode (default for demo), hero platforms use live adapters and
all others use seeded data. Per master doc §7.4.
"""

from __future__ import annotations

import os

from .base import PriceSourceAdapter
from .seeded import SeededAdapter

# Hero platforms that have live adapters (master doc §7.4)
LIVE_PLATFORMS = {"best_buy", "southwest", "hilton"}

# Per-platform overrides. Set via env var PRICE_SOURCE_OVERRIDES
# Format: "best_buy=live,hilton=seeded,target=live"
_override_cache: dict[str, str] | None = None


def _parse_overrides() -> dict[str, str]:
    global _override_cache
    if _override_cache is not None:
        return _override_cache

    raw = os.environ.get("PRICE_SOURCE_OVERRIDES", "")
    overrides: dict[str, str] = {}
    for pair in raw.split(","):
        pair = pair.strip()
        if "=" in pair:
            platform, mode = pair.split("=", 1)
            normalized_mode = mode.strip().lower()
            if normalized_mode in {"live", "seeded"}:
                overrides[platform.strip().lower()] = normalized_mode

    _override_cache = overrides
    return overrides


def get_mode() -> str:
    """Return the global price source mode."""
    mode = os.environ.get("PRICE_SOURCE_MODE", "mixed").strip().lower()
    if mode not in {"live", "seeded", "mixed"}:
        raise ValueError(f"Invalid PRICE_SOURCE_MODE: {mode!r}")
    return mode


def should_use_live(platform: str) -> bool:
    """Determine if a platform should use its live adapter."""
    overrides = _parse_overrides()

    # Per-platform override takes priority
    if platform in overrides:
        return overrides[platform] == "live"

    mode = get_mode()
    if mode == "live":
        return True
    if mode == "seeded":
        return False

    # mixed mode: only hero platforms are live
    return platform in LIVE_PLATFORMS


def get_adapter(platform: str) -> PriceSourceAdapter:
    """Return the correct adapter for a platform based on feature flags.

    Live adapters are imported lazily to avoid import errors when
    scraper dependencies aren't installed.
    """
    if not should_use_live(platform):
        return SeededAdapter()

    # Lazy import live adapters — they'll be added in tasks 4.2-4.11
    # For now, all live platforms fall back to seeded
    if platform == "best_buy":
        from .best_buy import BestBuyAdapter

        return BestBuyAdapter()

    if platform == "target":
        from .target import TargetAdapter

        return TargetAdapter()

    # TODO: uncomment as live adapters are implemented
    # if platform == "hilton":
    #     from .hilton import HiltonAdapter
    #     return HiltonAdapter()
    # if platform == "southwest":
    #     from .southwest import SouthwestAdapter
    #     return SouthwestAdapter()

    # Fallback until live adapters are wired
    return SeededAdapter()
