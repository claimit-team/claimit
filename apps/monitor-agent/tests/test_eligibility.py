"""Tests for eligibility validation rules engine (ticket 3.11).

Two test classes:

- `TestValidatorRules` — fine-grained rule tests with hand-built fixtures.
  One pass + at least one fail case per rule.
- `TestPlatformFixtures` — parametrized via subTest over `seed/policies/*.json`.
  Verifies the §4 platform edge cases against the actual seeded policies that
  ticket 2.12 (PR #34) shipped, so we exercise all 26 platforms exactly as
  prod will see them.
"""

from __future__ import annotations

import json
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from claimit_mongodb_models import Policy, PurchaseReadTolerant
from src.adapters.base import PriceSnapshot
from src.comparison import compare_prices
from src.eligibility import validate_eligibility

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SEED_DIR = _REPO_ROOT / "seed" / "policies"


def _load_seed_policy(platform: str) -> Policy:
    """Load a seeded policy JSON using model_construct.

    The seed has 27 platforms but the shared `Platform` StrEnum currently
    only lists 10 (best_buy, amazon, target, walmart, marriott, hilton,
    delta, united, american, southwest). `Policy.model_validate` would
    reject the other 16 on the enum field, even though the eligibility
    validator only does plain equality / boolean access on policy fields.
    `model_construct` skips validation — fields keep their JSON shape,
    which is the same shape the validator reads.

    Datetime conversion is still needed: pydantic's automatic
    string-to-datetime coercion runs in model_validate, which we're
    skipping, so we parse `last_verified` manually.
    """
    raw = json.loads((_SEED_DIR / f"{platform}.json").read_text())
    raw["last_verified"] = datetime.fromisoformat(raw["last_verified"]).replace(tzinfo=UTC)
    return Policy.model_construct(**raw)


def _make_purchase(
    *,
    platform: str = "best_buy",
    category: str = "retail",
    price_paid: float = 100.0,
    member_tier_at_purchase: str | None = None,
    purchase_date: datetime | None = None,
    purchase_date_basis: str = "order_date",
    window_expires: datetime | None = None,
    fare_class: str | None = None,
    room_type: str | None = None,
    bed_type: str | None = None,
    rate_type: str | None = None,
    claim_type: str = "self_service",
) -> PurchaseReadTolerant:
    """Build a PurchaseReadTolerant with controllable fields.

    The cron passes `PurchaseReadTolerant` to the validator at runtime
    (see `cron._is_degraded`'s flow), and many of the 26 platforms aren't
    in the strict `Platform` enum yet. PurchaseReadTolerant accepts the
    str-typed platform verbatim, so tests can cover every seeded
    platform without depending on enum expansion.
    """
    now = datetime.now(UTC)
    if purchase_date is None:
        purchase_date = now - timedelta(days=1)
    if window_expires is None:
        window_expires = now + timedelta(days=14)
    return PurchaseReadTolerant.model_construct(
        id=uuid4(),
        user_id=uuid4(),
        platform=platform,
        category=category,
        product_name="Sony WH-1000XM5",
        product_id="6505727",
        product_url=None,
        variant=None,
        fare_class=fare_class,
        room_type=room_type,
        bed_type=bed_type,
        rate_type=rate_type,
        price_paid=price_paid,
        member_price_at_purchase=None,
        non_member_price_at_purchase=None,
        currency="USD",
        purchase_date=purchase_date,
        purchase_date_basis=purchase_date_basis,
        window_expires=window_expires,
        order_id="ORD-1",
        member_tier_at_purchase=member_tier_at_purchase,
        status="monitoring",
        claim_type=claim_type,
        monitoring_cadence_minutes=60,
        last_checked_at=None,
        ingested_at=purchase_date,
        ingestion_source="gmail",
        receipt_storage_url=None,
        receipt_hash=None,
    )


def _make_snapshot(
    *,
    platform: str = "best_buy",
    price_member: float | None = 80.0,
    price_non_member: float | None = 80.0,
    is_bundle: bool | None = None,
    is_on_sale: bool | None = None,
    fare_class: str | None = None,
    room_type: str | None = None,
    bed_type: str | None = None,
    rate_type: str | None = None,
) -> PriceSnapshot:
    return PriceSnapshot(
        platform=platform,
        product_id="6505727",
        price_member=price_member,
        price_non_member=price_non_member,
        member_tier_required=None,
        currency="USD",
        checked_at=datetime.now(UTC),
        source="direct",
        is_bundle=is_bundle,
        is_on_sale=is_on_sale,
        fare_class=fare_class,
        room_type=room_type,
        bed_type=bed_type,
        rate_type=rate_type,
    )


def _make_policy(
    *,
    platform: str = "best_buy",
    category: str = "retail",
    window_days: int = 15,
    window_days_member: int | None = 60,
    pre_arrival_hours_required: int | None = None,
    covers_own_drops: bool = True,
    covers_competitor_drops: bool = False,
    loyalty_required: bool = False,
    award_ticket_eligible: bool | None = None,
    bundle_exclusions: bool = False,
    key_exclusions: list[str] | None = None,
    active: bool = True,
) -> Policy:
    """Build a Policy via model_construct so tests can use non-enum platforms.

    Same rationale as `_load_seed_policy`: the shared `Platform` enum
    doesn't yet list all 26 seeded platforms, and the validator doesn't
    care about enum membership — only field values.
    """
    return Policy.model_construct(
        id=uuid4(),
        platform=platform,
        category=category,
        window_days=window_days,
        window_days_member=window_days_member,
        pre_arrival_hours_required=pre_arrival_hours_required,
        covers_own_drops=covers_own_drops,
        covers_competitor_drops=covers_competitor_drops,
        claim_type="self_service",
        claim_url="https://example.com",
        claim_email=None,
        claim_phone=None,
        loyalty_required=loyalty_required,
        award_ticket_eligible=award_ticket_eligible,
        bundle_exclusions=bundle_exclusions,
        key_exclusions=key_exclusions or [],
        policy_url="https://example.com",
        policy_text_full="...",
        policy_text_relevant_clause="...",
        last_verified=datetime(2026, 5, 14, tzinfo=UTC),
        active=active,
    )


class TestValidatorRules(unittest.TestCase):
    """One pass + at least one fail per rule, with hand-built fixtures."""

    # -- happy path -----------------------------------------------------

    def test_eligible_drop_passes_all_rules(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, _make_policy(), snapshot, comparison)

        self.assertTrue(result.eligible)
        self.assertIsNone(result.code)
        self.assertIsNone(result.reason)

    # -- 1. policy active -----------------------------------------------

    def test_inactive_policy_rejects(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, _make_policy(active=False), snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "platform_inactive")

    # -- 2. has qualifying drop -----------------------------------------

    def test_no_drop_rejects(self) -> None:
        purchase = _make_purchase(price_paid=100.0)
        snapshot = _make_snapshot(price_non_member=100.0)  # same price
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, _make_policy(), snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "no_drop_or_tier_mismatch")

    def test_tier_mismatch_rejects(self) -> None:
        """Member buyer with no member price → comparison.is_eligible=False."""
        purchase = _make_purchase(member_tier_at_purchase="my_best_buy")
        snapshot = _make_snapshot(price_member=None, price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, _make_policy(), snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "no_drop_or_tier_mismatch")

    # -- 3. window expired ----------------------------------------------

    def test_window_expired_rejects(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(window_expires=now - timedelta(hours=1))
        snapshot = _make_snapshot(price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, _make_policy(), snapshot, comparison, now=now)

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "window_expired")

    def test_window_just_about_to_expire_passes(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(window_expires=now + timedelta(minutes=5))
        snapshot = _make_snapshot(price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, _make_policy(), snapshot, comparison, now=now)

        self.assertTrue(result.eligible)

    def test_naive_window_expires_treated_as_utc(self) -> None:
        """Mongo can hand back naive datetimes; cron preserves that flow."""
        now = datetime.now(UTC)
        purchase = _make_purchase(window_expires=(now + timedelta(days=1)).replace(tzinfo=None))
        snapshot = _make_snapshot(price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, _make_policy(), snapshot, comparison, now=now)

        self.assertTrue(result.eligible)

    # -- 4. covers own drops --------------------------------------------

    def test_own_drops_not_covered_rejects(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase, _make_policy(covers_own_drops=False), snapshot, comparison
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "own_drops_not_covered")

    # -- 5. bundle exclusion --------------------------------------------

    def test_bundle_excluded_when_signal_present(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0, is_bundle=True)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase, _make_policy(bundle_exclusions=True), snapshot, comparison
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "bundle")

    def test_bundle_unknown_passes(self) -> None:
        """`is_bundle=None` (unknown) must not block — adapters fill in over time."""
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0, is_bundle=None)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase, _make_policy(bundle_exclusions=True), snapshot, comparison
        )

        self.assertTrue(result.eligible)

    def test_bundle_signal_ignored_when_policy_allows(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0, is_bundle=True)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase, _make_policy(bundle_exclusions=False), snapshot, comparison
        )

        self.assertTrue(result.eligible)

    # -- 6. on-sale exclusion -------------------------------------------

    def test_on_sale_excluded_when_key_exclusions_matches(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0, is_on_sale=True)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(key_exclusions=["clearance", "open-box items"]),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "clearance")

    def test_on_sale_unknown_passes(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0, is_on_sale=None)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase, _make_policy(key_exclusions=["clearance"]), snapshot, comparison
        )

        self.assertTrue(result.eligible)

    def test_on_sale_signal_ignored_when_no_sale_marker_in_policy(self) -> None:
        purchase = _make_purchase()
        snapshot = _make_snapshot(price_non_member=80.0, is_on_sale=True)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(key_exclusions=["marketplace third-party sellers"]),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)

    # -- 7. pre-arrival hours (hotel) -----------------------------------

    def test_hotel_pre_arrival_window_missed_rejects(self) -> None:
        now = datetime.now(UTC)
        check_in = now + timedelta(hours=24)  # 24h before check-in
        purchase = _make_purchase(
            platform="wyndham",
            category="hotel",
            purchase_date=check_in,
            purchase_date_basis="check_in_date",
            window_expires=now + timedelta(hours=1),
            member_tier_at_purchase="wyndham_diamond",
        )
        snapshot = _make_snapshot(platform="wyndham", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="wyndham",
                category="hotel",
                pre_arrival_hours_required=48,
                loyalty_required=True,
            ),
            snapshot,
            comparison,
            now=now,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "pre_arrival_window_missed")

    def test_hotel_pre_arrival_window_met_passes(self) -> None:
        now = datetime.now(UTC)
        check_in = now + timedelta(hours=72)  # 72h before check-in > 48h
        purchase = _make_purchase(
            platform="wyndham",
            category="hotel",
            purchase_date=check_in,
            purchase_date_basis="check_in_date",
            window_expires=now + timedelta(hours=12),
            member_tier_at_purchase="wyndham_diamond",
        )
        snapshot = _make_snapshot(platform="wyndham", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="wyndham",
                category="hotel",
                pre_arrival_hours_required=48,
                loyalty_required=True,
            ),
            snapshot,
            comparison,
            now=now,
        )

        self.assertTrue(result.eligible)

    def test_hotel_without_pre_arrival_field_skips_check(self) -> None:
        """Policies with pre_arrival_hours_required=None (Hilton, Marriott, ...)
        skip the rule entirely even if check-in is moments away."""
        now = datetime.now(UTC)
        purchase = _make_purchase(
            platform="hilton",
            category="hotel",
            purchase_date=now + timedelta(hours=1),
            purchase_date_basis="check_in_date",
            window_expires=now + timedelta(hours=12),
            member_tier_at_purchase="hilton_diamond",
        )
        snapshot = _make_snapshot(platform="hilton", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="hilton",
                category="hotel",
                pre_arrival_hours_required=None,
                loyalty_required=True,
            ),
            snapshot,
            comparison,
            now=now,
        )

        self.assertTrue(result.eligible)

    # -- 8. loyalty required --------------------------------------------

    def test_loyalty_required_without_tier_rejects(self) -> None:
        purchase = _make_purchase(
            platform="hilton",
            category="hotel",
            member_tier_at_purchase=None,
        )
        snapshot = _make_snapshot(platform="hilton", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="hilton", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "loyalty_required")

    def test_loyalty_required_with_literal_none_string_rejects(self) -> None:
        """`LoyaltyTier.NONE = "none"` must not be misread as a member tier."""
        purchase = _make_purchase(
            platform="hilton",
            category="hotel",
            member_tier_at_purchase="none",
        )
        snapshot = _make_snapshot(platform="hilton", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="hilton", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "loyalty_required")

    def test_loyalty_required_with_real_tier_passes(self) -> None:
        purchase = _make_purchase(
            platform="hilton",
            category="hotel",
            member_tier_at_purchase="hilton_diamond",
        )
        snapshot = _make_snapshot(platform="hilton", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="hilton", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)

    # -- 9. award ticket exclusion (airline) ----------------------------

    def test_award_ticket_rejected_when_policy_excludes(self) -> None:
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Award Economy",
        )
        snapshot = _make_snapshot(platform="united", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="united",
                category="airline",
                award_ticket_eligible=False,
            ),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "award_ticket_excluded")

    def test_miles_fare_class_rejected_as_award(self) -> None:
        purchase = _make_purchase(
            platform="southwest",
            category="airline",
            fare_class="Wanna Get Away (Rapid Rewards)",
        )
        snapshot = _make_snapshot(platform="southwest", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="southwest",
                category="airline",
                award_ticket_eligible=False,
            ),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "award_ticket_excluded")

    def test_cash_fare_class_passes_award_check(self) -> None:
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Main Cabin",
        )
        snapshot = _make_snapshot(platform="united", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="united",
                category="airline",
                award_ticket_eligible=False,
            ),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)

    # -- 10. basic economy ----------------------------------------------

    def test_basic_economy_rejected_when_in_key_exclusions(self) -> None:
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Basic Economy",
        )
        snapshot = _make_snapshot(platform="united", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="united",
                category="airline",
                award_ticket_eligible=False,
                key_exclusions=["Basic Economy fares excluded"],
            ),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "basic_economy")

    def test_main_cabin_passes_basic_economy_check(self) -> None:
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Main Cabin",
        )
        snapshot = _make_snapshot(platform="united", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(
                platform="united",
                category="airline",
                award_ticket_eligible=False,
                key_exclusions=["Basic Economy fares excluded"],
            ),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)

    # -- 11. fare-class match (airline) ---------------------------------

    def test_fare_class_mismatch_rejects(self) -> None:
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Main Cabin",
        )
        snapshot = _make_snapshot(
            platform="united",
            price_non_member=80.0,
            fare_class="First",
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="united", category="airline"),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "fare_class_mismatch")

    def test_fare_class_match_passes(self) -> None:
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Main Cabin",
        )
        snapshot = _make_snapshot(
            platform="united",
            price_non_member=80.0,
            fare_class="Main Cabin",
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="united", category="airline"),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)

    def test_fare_class_unknown_on_snapshot_passes(self) -> None:
        """Today's adapters don't supply snapshot.fare_class; structural pass."""
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Main Cabin",
        )
        snapshot = _make_snapshot(
            platform="united",
            price_non_member=80.0,
            fare_class=None,
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="united", category="airline"),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)

    # -- 12. identical-room (hotel) -------------------------------------

    def test_hotel_room_type_mismatch_rejects(self) -> None:
        purchase = _make_purchase(
            platform="marriott",
            category="hotel",
            room_type="King Suite",
            member_tier_at_purchase="marriott_gold",
        )
        snapshot = _make_snapshot(
            platform="marriott",
            price_non_member=80.0,
            room_type="Standard Queen",
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="marriott", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "identical_room_mismatch")

    def test_hotel_bed_type_mismatch_rejects(self) -> None:
        purchase = _make_purchase(
            platform="hyatt",
            category="hotel",
            bed_type="King",
            member_tier_at_purchase="hyatt_globalist",
        )
        snapshot = _make_snapshot(
            platform="hyatt",
            price_non_member=80.0,
            bed_type="Two Doubles",
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="hyatt", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "identical_room_mismatch")

    def test_hotel_rate_type_mismatch_rejects(self) -> None:
        purchase = _make_purchase(
            platform="hilton",
            category="hotel",
            rate_type="Flexible",
            member_tier_at_purchase="hilton_diamond",
        )
        snapshot = _make_snapshot(
            platform="hilton",
            price_non_member=80.0,
            rate_type="Prepaid",
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="hilton", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "identical_room_mismatch")

    def test_hotel_room_match_passes(self) -> None:
        purchase = _make_purchase(
            platform="marriott",
            category="hotel",
            room_type="King Suite",
            bed_type="King",
            rate_type="Flexible",
            member_tier_at_purchase="marriott_gold",
        )
        snapshot = _make_snapshot(
            platform="marriott",
            price_non_member=80.0,
            room_type="King Suite",
            bed_type="King",
            rate_type="Flexible",
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="marriott", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)

    def test_hotel_room_unknown_on_snapshot_passes(self) -> None:
        """Structural: hotel adapters don't yet supply room metadata."""
        purchase = _make_purchase(
            platform="marriott",
            category="hotel",
            room_type="King Suite",
            member_tier_at_purchase="marriott_gold",
        )
        snapshot = _make_snapshot(platform="marriott", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(
            purchase,
            _make_policy(platform="marriott", category="hotel", loyalty_required=True),
            snapshot,
            comparison,
        )

        self.assertTrue(result.eligible)


class TestPlatformFixtures(unittest.TestCase):
    """Verify the §4 platform edge cases against seeded policies on disk.

    Loads each `seed/policies/<platform>.json` and exercises the validator
    against the exact policy doc 2.12 ships to Mongo. Catches drift between
    the validator and the seeded data (e.g., a policy gaining a new key
    exclusion that the validator no longer recognizes).
    """

    # The 26 active platforms — Walmart and Amazon are seeded with
    # active:false and tested separately under `test_inactive_platforms`.
    ACTIVE_RETAIL = (
        "best_buy",
        "costco",
        "crutchfield",
        "dell",
        "dicks_sporting_goods",
        "home_depot",
        "jcpenney",
        "lowes",
        "macys",
        "newegg",
        "nordstrom",
        "staples",
        "target",
    )
    ACTIVE_AIRLINE = ("alaska", "american", "delta", "jetblue", "southwest", "united")
    ACTIVE_HOTEL = ("hilton", "hyatt", "ihg", "marriott", "wyndham")

    def test_all_retail_platforms_happy_path(self) -> None:
        # Costco is the only retailer with loyalty_required=true in the seed —
        # it's a paid-membership retailer. Other retailers don't gate on tier.
        loyalty_retailers = {"costco": "costco_gold_star"}
        for platform in self.ACTIVE_RETAIL:
            with self.subTest(platform=platform):
                policy = _load_seed_policy(platform)
                purchase = _make_purchase(
                    platform=platform,
                    category="retail",
                    member_tier_at_purchase=loyalty_retailers.get(platform),
                )
                snapshot = _make_snapshot(platform=platform)
                comparison = compare_prices(purchase, snapshot)
                result = validate_eligibility(purchase, policy, snapshot, comparison)

                self.assertTrue(
                    result.eligible,
                    f"{platform} happy path should be eligible; got code={result.code}, reason={result.reason}",
                )

    def test_all_active_airlines_happy_path_with_cash_fare(self) -> None:
        for platform in self.ACTIVE_AIRLINE:
            with self.subTest(platform=platform):
                policy = _load_seed_policy(platform)
                purchase = _make_purchase(
                    platform=platform,
                    category="airline",
                    fare_class="Main Cabin",
                )
                snapshot = _make_snapshot(platform=platform, price_non_member=80.0)
                comparison = compare_prices(purchase, snapshot)
                result = validate_eligibility(purchase, policy, snapshot, comparison)

                self.assertTrue(
                    result.eligible,
                    f"{platform} cash fare happy path should be eligible; got code={result.code}, reason={result.reason}",
                )

    def test_all_hotels_happy_path_with_loyalty_tier(self) -> None:
        now = datetime.now(UTC)
        # Some hotels (Wyndham) require check-in >=48h out — set a
        # generously distant check-in so all five hotels pass.
        check_in = now + timedelta(days=30)
        loyalty_tiers = {
            "hilton": "hilton_diamond",
            "hyatt": "hyatt_globalist",
            "ihg": "ihg_diamond",
            "marriott": "marriott_gold",
            "wyndham": "wyndham_diamond",
        }
        for platform in self.ACTIVE_HOTEL:
            with self.subTest(platform=platform):
                policy = _load_seed_policy(platform)
                purchase = _make_purchase(
                    platform=platform,
                    category="hotel",
                    purchase_date=check_in,
                    purchase_date_basis="check_in_date",
                    window_expires=now + timedelta(hours=12),
                    member_tier_at_purchase=loyalty_tiers[platform],
                )
                snapshot = _make_snapshot(platform=platform, price_non_member=80.0)
                comparison = compare_prices(purchase, snapshot)
                result = validate_eligibility(purchase, policy, snapshot, comparison, now=now)

                self.assertTrue(
                    result.eligible,
                    f"{platform} loyalty happy path should be eligible; got code={result.code}, reason={result.reason}",
                )

    def test_inactive_platforms_rejected(self) -> None:
        """Walmart and Amazon are seeded with active=false — both must reject."""
        for platform in ("walmart", "amazon"):
            with self.subTest(platform=platform):
                policy = _load_seed_policy(platform)
                self.assertFalse(policy.active, f"{platform} seed should be inactive")
                purchase = _make_purchase(platform=platform, category="retail")
                snapshot = _make_snapshot(platform=platform, price_non_member=80.0)
                comparison = compare_prices(purchase, snapshot)
                result = validate_eligibility(purchase, policy, snapshot, comparison)

                self.assertFalse(result.eligible)
                self.assertEqual(result.reason, "platform_inactive")

    # -- platform-specific edge cases -----------------------------------

    def test_best_buy_15_day_window_for_non_members(self) -> None:
        now = datetime.now(UTC)
        policy = _load_seed_policy("best_buy")
        # Day-16 non-member purchase — window_expires precomputed at ingest
        # to purchase_date + 15 days. Validator just trusts that field.
        purchase = _make_purchase(
            platform="best_buy",
            purchase_date=now - timedelta(days=16),
            window_expires=now - timedelta(days=1),
        )
        snapshot = _make_snapshot(platform="best_buy", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison, now=now)

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "window_expired")

    def test_best_buy_60_day_window_for_plus_members(self) -> None:
        now = datetime.now(UTC)
        policy = _load_seed_policy("best_buy")
        purchase = _make_purchase(
            platform="best_buy",
            purchase_date=now - timedelta(days=30),
            window_expires=now + timedelta(days=30),  # member window: 60 days
            member_tier_at_purchase="my_best_buy_plus",
        )
        snapshot = _make_snapshot(
            platform="best_buy",
            price_member=80.0,
            price_non_member=85.0,
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison, now=now)

        self.assertTrue(result.eligible)

    def test_nordstrom_anniversary_sale_excluded(self) -> None:
        policy = _load_seed_policy("nordstrom")
        purchase = _make_purchase(platform="nordstrom")
        snapshot = _make_snapshot(
            platform="nordstrom",
            price_non_member=80.0,
            is_on_sale=True,
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "clearance")

    def test_best_buy_bundle_excluded(self) -> None:
        policy = _load_seed_policy("best_buy")
        purchase = _make_purchase(platform="best_buy")
        snapshot = _make_snapshot(
            platform="best_buy",
            price_non_member=80.0,
            is_bundle=True,
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "bundle")

    def test_wyndham_pre_arrival_48h_rejected(self) -> None:
        now = datetime.now(UTC)
        policy = _load_seed_policy("wyndham")
        purchase = _make_purchase(
            platform="wyndham",
            category="hotel",
            purchase_date=now + timedelta(hours=24),  # 24h before check-in
            purchase_date_basis="check_in_date",
            window_expires=now + timedelta(hours=12),
            member_tier_at_purchase="wyndham_diamond",
        )
        snapshot = _make_snapshot(platform="wyndham", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison, now=now)

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "pre_arrival_window_missed")

    def test_southwest_award_ticket_rejected(self) -> None:
        policy = _load_seed_policy("southwest")
        purchase = _make_purchase(
            platform="southwest",
            category="airline",
            fare_class="Wanna Get Away Award",
        )
        snapshot = _make_snapshot(platform="southwest", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "award_ticket_excluded")

    def test_united_basic_economy_rejected(self) -> None:
        policy = _load_seed_policy("united")
        purchase = _make_purchase(
            platform="united",
            category="airline",
            fare_class="Basic Economy",
        )
        snapshot = _make_snapshot(platform="united", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "basic_economy")

    def test_jetblue_window_expired_rejects(self) -> None:
        """JetBlue's same-day window resets at midnight — once past, validator
        rejects via window_expired (window_expires precomputed at ingest)."""
        now = datetime.now(UTC)
        policy = _load_seed_policy("jetblue")
        purchase = _make_purchase(
            platform="jetblue",
            category="airline",
            fare_class="Blue Basic",
            purchase_date=now - timedelta(days=1),
            window_expires=now - timedelta(hours=1),
        )
        snapshot = _make_snapshot(platform="jetblue", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison, now=now)

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "window_expired")

    def test_hilton_without_loyalty_tier_rejected(self) -> None:
        policy = _load_seed_policy("hilton")
        purchase = _make_purchase(
            platform="hilton",
            category="hotel",
            member_tier_at_purchase=None,
        )
        snapshot = _make_snapshot(platform="hilton", price_non_member=80.0)
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison)

        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "loyalty_required")

    def test_marriott_identical_room_mismatch_rejected(self) -> None:
        policy = _load_seed_policy("marriott")
        now = datetime.now(UTC)
        purchase = _make_purchase(
            platform="marriott",
            category="hotel",
            room_type="King Suite",
            member_tier_at_purchase="marriott_gold",
            purchase_date=now + timedelta(days=30),
            purchase_date_basis="check_in_date",
            window_expires=now + timedelta(hours=12),
        )
        snapshot = _make_snapshot(
            platform="marriott",
            price_non_member=80.0,
            room_type="Standard Queen",
        )
        comparison = compare_prices(purchase, snapshot)
        result = validate_eligibility(purchase, policy, snapshot, comparison, now=now)

        self.assertFalse(result.eligible)
        self.assertEqual(result.code, "identical_room_mismatch")


if __name__ == "__main__":
    unittest.main()
