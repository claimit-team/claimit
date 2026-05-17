"""Seeded adapter — returns fixture data for demo platforms."""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime
from pathlib import Path

from .base import PriceFetchError, PriceSnapshot, PriceSourceAdapter

# Fixture file: packages/shared/fixtures/price_history.sample.json
_FIXTURE_DIR = Path(__file__).resolve().parents[4] / "packages" / "shared" / "fixtures"


class SeededAdapter(PriceSourceAdapter):
    """Returns pre-seeded price data from fixture files.

    Used for the 23 non-hero platforms during demo. Also serves as
    the fallback when a live adapter fails (via feature flag flip).
    """

    def __init__(self) -> None:
        self._cache: dict[str, list[dict]] | None = None

    def _load_fixtures(self) -> dict[str, list[dict]]:
        if self._cache is not None:
            return self._cache

        fixture_path = _FIXTURE_DIR / "price_history.sample.json"
        if not fixture_path.exists():
            self._cache = {}
            return self._cache

        with open(fixture_path) as f:
            raw = json.load(f)

        # Group by platform
        grouped: dict[str, list[dict]] = {}
        entries = raw if isinstance(raw, list) else [raw]
        for entry in entries:
            plat = entry.get("platform", "unknown")
            grouped.setdefault(plat, []).append(entry)

        self._cache = grouped
        return self._cache

    async def fetch_current_price(
        self,
        platform: str,
        product_id: str,
        product_url: str | None = None,
        member_tier: str | None = None,
    ) -> PriceSnapshot:
        fixtures = self._load_fixtures()
        entries = fixtures.get(platform, [])

        # Find matching product or pick random entry for platform
        match = None
        for entry in entries:
            if entry.get("product_id") == product_id:
                match = entry
                break

        if match is None and entries:
            match = random.choice(entries)

        if match is None:
            raise PriceFetchError(platform, product_id, "No seeded data available")

        resolved_product_id = str(match.get("product_id", product_id))
        return PriceSnapshot(
            platform=platform,
            product_id=resolved_product_id,
            price_member=match.get("price_member"),
            price_non_member=match.get("price_non_member"),
            member_tier_required=match.get("member_tier_required"),
            currency="USD",
            checked_at=datetime.now(UTC),
            source="seeded",
            evidence_screenshot_url=None,
            raw_response_hash=None,
        )
