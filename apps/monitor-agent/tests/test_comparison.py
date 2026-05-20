"""Tests for member-tier-aware price comparison (ticket 3.10)."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from claimit_mongodb_models import Purchase
from src.adapters.base import PriceSnapshot
from src.comparison import compare_prices


def _make_purchase(
    *,
    price_paid: float = 100.0,
    member_tier_at_purchase: str | None = None,
) -> Purchase:
    """Build a Purchase with controllable tier/price fields, leaving the rest stable."""
    purchase_date = datetime.now(UTC) - timedelta(days=1)
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
        price_paid=price_paid,
        member_price_at_purchase=None,
        non_member_price_at_purchase=None,
        currency="USD",
        purchase_date=purchase_date,
        purchase_date_basis="order_date",
        window_expires=purchase_date + timedelta(days=14),
        order_id="BBY-123",
        member_tier_at_purchase=member_tier_at_purchase,
        status="monitoring",
        claim_type="self_service",
        monitoring_cadence_minutes=60,
        last_checked_at=None,
        ingested_at=purchase_date,
        ingestion_source="gmail",
        receipt_storage_url=None,
        receipt_hash=None,
        extraction_confidence={
            "platform": 1.0,
            "price": 1.0,
            "overall_min": 1.0,
        },
    )


def _make_snapshot(
    *,
    price_member: float | None,
    price_non_member: float | None,
    member_tier_required: str | None = "my_best_buy",
) -> PriceSnapshot:
    return PriceSnapshot(
        platform="best_buy",
        product_id="6505727",
        price_member=price_member,
        price_non_member=price_non_member,
        member_tier_required=member_tier_required,
        currency="USD",
        checked_at=datetime.now(UTC),
        source="direct",
    )


class TestCompareprices(unittest.TestCase):
    def test_member_buyer_uses_member_price_when_dropped(self) -> None:
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase="my_best_buy")
        snapshot = _make_snapshot(price_member=80.0, price_non_member=95.0)

        result = compare_prices(purchase, snapshot)

        self.assertTrue(result.is_member_comparison)
        self.assertEqual(result.current_price, 80.0)
        self.assertEqual(result.drop_amount, 20.0)
        self.assertEqual(result.drop_percentage, 20.0)
        self.assertTrue(result.is_eligible)

    def test_non_member_buyer_uses_non_member_price_when_dropped(self) -> None:
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase=None)
        snapshot = _make_snapshot(price_member=70.0, price_non_member=90.0)

        result = compare_prices(purchase, snapshot)

        self.assertFalse(result.is_member_comparison)
        self.assertEqual(result.current_price, 90.0)
        self.assertEqual(result.drop_amount, 10.0)
        self.assertEqual(result.drop_percentage, 10.0)
        self.assertTrue(result.is_eligible)

    def test_member_buyer_no_member_price_does_not_fall_back(self) -> None:
        """False-positive guard: member buyer must not be compared to non-member price."""
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase="my_best_buy")
        snapshot = _make_snapshot(price_member=None, price_non_member=80.0)

        result = compare_prices(purchase, snapshot)

        self.assertTrue(result.is_member_comparison)
        self.assertIsNone(result.current_price)
        self.assertEqual(result.drop_amount, 0.0)
        self.assertEqual(result.drop_percentage, 0.0)
        self.assertFalse(result.is_eligible)

    def test_non_member_buyer_no_non_member_price_does_not_fall_back(self) -> None:
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase=None)
        snapshot = _make_snapshot(price_member=60.0, price_non_member=None)

        result = compare_prices(purchase, snapshot)

        self.assertFalse(result.is_member_comparison)
        self.assertIsNone(result.current_price)
        self.assertFalse(result.is_eligible)

    def test_no_drop_when_current_equals_paid(self) -> None:
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase=None)
        snapshot = _make_snapshot(price_member=None, price_non_member=100.0)

        result = compare_prices(purchase, snapshot)

        self.assertEqual(result.drop_amount, 0.0)
        self.assertEqual(result.drop_percentage, 0.0)
        self.assertFalse(result.is_eligible)

    def test_price_higher_than_paid_is_not_eligible(self) -> None:
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase=None)
        snapshot = _make_snapshot(price_member=None, price_non_member=120.0)

        result = compare_prices(purchase, snapshot)

        self.assertEqual(result.drop_amount, -20.0)
        self.assertEqual(result.drop_percentage, -20.0)
        self.assertFalse(result.is_eligible)

    def test_tier_string_none_is_treated_as_non_member(self) -> None:
        """`LoyaltyTier.NONE = "none"` must not be misread as a member tier."""
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase="none")
        snapshot = _make_snapshot(price_member=50.0, price_non_member=90.0)

        result = compare_prices(purchase, snapshot)

        self.assertFalse(result.is_member_comparison)
        self.assertEqual(result.current_price, 90.0)
        self.assertTrue(result.is_eligible)

    def test_member_tier_null_is_treated_as_non_member(self) -> None:
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase=None)
        snapshot = _make_snapshot(price_member=50.0, price_non_member=90.0)

        result = compare_prices(purchase, snapshot)

        self.assertFalse(result.is_member_comparison)
        self.assertEqual(result.current_price, 90.0)

    def test_member_buyer_does_not_pick_bigger_non_member_drop(self) -> None:
        """Tier match wins; we never pick whichever tier has the biggest drop."""
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase="my_best_buy")
        snapshot = _make_snapshot(price_member=90.0, price_non_member=50.0)

        result = compare_prices(purchase, snapshot)

        self.assertTrue(result.is_member_comparison)
        self.assertEqual(result.current_price, 90.0)
        self.assertEqual(result.drop_amount, 10.0)

    def test_drop_percentage_math(self) -> None:
        purchase = _make_purchase(price_paid=100.0, member_tier_at_purchase=None)
        snapshot = _make_snapshot(price_member=None, price_non_member=75.0)

        result = compare_prices(purchase, snapshot)

        self.assertEqual(result.drop_amount, 25.0)
        self.assertEqual(result.drop_percentage, 25.0)


if __name__ == "__main__":
    unittest.main()
