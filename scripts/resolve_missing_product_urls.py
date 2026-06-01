#!/usr/bin/env python3
"""Backfill product_url for monitoring Best Buy / Target purchases that lack one.

Resolves a scrapeable on-host product URL from each purchase's product_name via
the monitor-agent resolver (ScraperAPI). Dry-run by default — pass --apply to
write. Throttled + --limit bounded to keep ScraperAPI credit burn small.

This complements the live path (the /pubsub/purchase.ingested handler + the cron
lazy resolve); it exists to heal purchases that entered monitoring before the
resolver shipped.

Required env:
    MONGODB_URI               Atlas connection string
    SCRAPERAPI_KEY            ScraperAPI key (or GOOGLE_CLOUD_PROJECT for Secret Manager)
    TARGET_REDSKY_KEY         (optional) override for the public RedSky key

Usage (from repo root):
    export MONGODB_URI="$(gcloud secrets versions access latest --secret=mongodb-uri ...)"
    export SCRAPERAPI_KEY="$(gcloud secrets versions access latest --secret=scraperapi-key ...)"
    uv run --project apps/monitor-agent python scripts/resolve_missing_product_urls.py --limit 25
    uv run --project apps/monitor-agent python scripts/resolve_missing_product_urls.py --apply --limit 25
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "monitor-agent"))

from claimit_mongodb_models import MongoDBClient, Purchase  # noqa: E402
from src.resolver import (  # noqa: E402
    MIN_CONFIDENCE,
    RESOLVABLE_PLATFORMS,
    Scenario,
    resolve_product_url,
)

_QUERY = {
    "status": "monitoring",
    "platform": {"$in": sorted(RESOLVABLE_PLATFORMS)},
    "$or": [
        {"product_url": None},
        {"product_url": {"$exists": False}},
        {"last_monitor_error_code": "missing_product_url"},
    ],
}


async def _run(limit: int, apply: bool, sleep_seconds: float) -> None:
    db = MongoDBClient()
    try:
        purchases = await db.find_purchases(_QUERY, limit=limit)
        print(f"Found {len(purchases)} candidate purchase(s) (limit={limit}, apply={apply})\n")
        resolved = unresolved = already_valid = failed = 0
        for purchase in purchases:
            if purchase.platform not in RESOLVABLE_PLATFORMS or not purchase.product_name:
                continue
            try:
                result = await resolve_product_url(
                    platform=purchase.platform,
                    product_name=purchase.product_name,
                    price_paid=purchase.price_paid or 0.0,
                    existing_url=purchase.product_url,
                )

                if result.scenario is Scenario.ALREADY_VALID:
                    already_valid += 1
                    print(
                        f"[{purchase.platform}] {purchase.product_name!r}\n"
                        f"    -> ALREADY VALID (clearing stale error)"
                    )
                    if apply and purchase.last_monitor_error_code == "missing_product_url":
                        await db.partial_update(
                            "purchases",
                            purchase.id,
                            {
                                "last_monitor_error": None,
                                "last_monitor_error_at": None,
                                "last_monitor_error_code": None,
                            },
                            Purchase,
                        )
                        print("    stale flags cleared.")
                elif result.url:
                    resolved += 1
                    low_conf_marker = (
                        "  ⚠ LOW CONFIDENCE" if result.confidence < MIN_CONFIDENCE else ""
                    )
                    print(
                        f"[{purchase.platform}] {purchase.product_name!r}\n"
                        f"    -> {result.url}  (confidence={result.confidence:.2f})"
                        f"{low_conf_marker}"
                    )
                    if apply:
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
                        print("    written.")
                else:
                    unresolved += 1
                    print(f"[{purchase.platform}] {purchase.product_name!r}\n    -> UNRESOLVED")
            except Exception:
                failed += 1
                import traceback

                print(
                    f"[{purchase.platform}] {purchase.product_name!r}\n"
                    f"    -> ERROR (continuing)"
                )
                traceback.print_exc()
            await asyncio.sleep(sleep_seconds)

        print(
            f"\nDone. resolved={resolved} unresolved={unresolved} "
            f"already_valid={already_valid} failed={failed} "
            f"(apply={apply} — {'wrote changes' if apply else 'dry run, no writes'})"
        )
    finally:
        await db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Write resolved URLs (default: dry run)"
    )
    parser.add_argument("--limit", type=int, default=50, help="Max purchases to process")
    parser.add_argument(
        "--sleep", type=float, default=1.0, help="Seconds to sleep between lookups (throttle)"
    )
    args = parser.parse_args()
    asyncio.run(_run(limit=args.limit, apply=args.apply, sleep_seconds=args.sleep))


if __name__ == "__main__":
    main()
