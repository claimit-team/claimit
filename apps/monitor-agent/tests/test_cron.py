"""Tests for monitor-agent cron orchestration."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from claimit_mongodb_models import Purchase
from src.cron import run_cron


def _purchase_with_naive_datetimes() -> Purchase:
    now = datetime.now(UTC).replace(tzinfo=None)
    return Purchase(
        _id=uuid4(),
        user_id=uuid4(),
        platform="best_buy",
        category="retail",
        product_name="Sony WH-1000XM5",
        product_id="6505727",
        product_url="https://www.bestbuy.com/site/foo/6505727.p",
        variant=None,
        fare_class=None,
        room_type=None,
        bed_type=None,
        rate_type=None,
        price_paid=349.99,
        member_price_at_purchase=None,
        non_member_price_at_purchase=349.99,
        currency="USD",
        purchase_date=now - timedelta(days=1),
        purchase_date_basis="order_date",
        window_expires=now + timedelta(days=2),
        order_id="BBY-123",
        member_tier_at_purchase=None,
        status="monitoring",
        claim_type="self_service",
        monitoring_cadence_minutes=60,
        last_checked_at=now,
        ingested_at=now - timedelta(days=1),
        ingestion_source="gmail",
        receipt_storage_url=None,
        receipt_hash=None,
        extraction_confidence={
            "platform": 1.0,
            "price": 1.0,
            "overall_min": 1.0,
        },
    )


class _FakeDB:
    def __init__(self, purchases: list[Purchase]) -> None:
        self.purchases = purchases
        self.updates: list[dict[str, object]] = []

    async def find_purchases(self, _filter: dict[str, object], limit: int = 100) -> list[Purchase]:
        return self.purchases[:limit]

    async def partial_update(
        self,
        _collection: str,
        _id: object,
        updates: dict[str, object],
        _model: object,
    ) -> bool:
        self.updates.append(updates)
        return True


class TestRunCron(unittest.IsolatedAsyncioTestCase):
    async def test_naive_mongo_datetimes_do_not_crash_cadence_checks(self) -> None:
        purchase = _purchase_with_naive_datetimes()
        db = _FakeDB([purchase])

        summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["scanned"], 1)
        self.assertEqual(summary["due"], 0)
        self.assertEqual(summary["errors"], 0)
        self.assertEqual(purchase.window_expires.tzinfo, UTC)
        self.assertEqual(purchase.last_checked_at.tzinfo, UTC)
