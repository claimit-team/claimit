"""Seeded adapter — returns fixture data for demo platforms."""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime
from pathlib import Path

from .base import PriceFetchError, PriceSnapshot, PriceSourceAdapter


def _find_fixture_dir() -> Path:
    """Locate ``packages/shared/fixtures`` across dev + Docker layouts.

    Two supported on-disk shapes:

    - **Dev monorepo:** ``<repo>/apps/monitor-agent/src/adapters/seeded.py``
      → ``parents[4] = <repo>`` → fixtures at ``<repo>/packages/shared/fixtures``.
    - **Docker runtime image** (``apps/monitor-agent/Dockerfile``):
      ``/app/src/adapters/seeded.py`` → only 4 parents total
      (``parents[3] = /``); fixtures are copied to
      ``/app/packages/shared/fixtures`` next to ``/app/src``.

    The previous ``parents[4]`` literal worked in dev but raised
    ``IndexError`` at module-import time inside the Docker image, which
    propagated through ``adapters/config.py`` → ``cron.py`` → ``main.py``
    and crashed the Cloud Run container before the startup probe could
    succeed. We try each candidate and fall back to the absolute path
    used by the runtime image so a future repo restructure can't break
    boot again.
    """
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "packages" / "shared" / "fixtures",  # docker /app
        Path("/app/packages/shared/fixtures"),  # docker absolute fallback
    ]
    if len(here.parents) > 4:
        candidates.insert(0, here.parents[4] / "packages" / "shared" / "fixtures")
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    # Don't raise at import time — _load_fixtures() handles the missing-
    # directory case gracefully (returns an empty cache → PriceFetchError
    # at call time). Returning the most likely path lets the caller log
    # something meaningful if it ever does try to read.
    return candidates[0]


_FIXTURE_DIR = _find_fixture_dir()


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
