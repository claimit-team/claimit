"""Tests for monitor-agent cron orchestration."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from claimit_mongodb_models import Claim, Policy, PriceHistory, Purchase, PurchaseReadTolerant
from src import cron as cron_module
from src.adapters.base import PriceFetchError, PriceSnapshot, PriceSourceAdapter
from src.cron import run_cron


def _default_policy(platform: str = "best_buy") -> Policy:
    """Permissive policy used by cron tests that hit the eligibility path.

    Built via `model_construct` for the same reason as in `test_eligibility.py`:
    several platforms in the seed aren't in the shared `Platform` enum yet.
    """
    return Policy.model_construct(
        id=uuid4(),
        platform=platform,
        category="retail",
        window_days=15,
        window_days_member=60,
        pre_arrival_hours_required=None,
        covers_own_drops=True,
        covers_competitor_drops=False,
        claim_type="self_service",
        claim_url="https://example.com",
        claim_email=None,
        claim_phone=None,
        loyalty_required=False,
        award_ticket_eligible=None,
        bundle_exclusions=False,
        key_exclusions=[],
        policy_url="https://example.com",
        policy_text_full="...",
        policy_text_relevant_clause="...",
        last_verified=datetime(2026, 5, 14, tzinfo=UTC),
        active=True,
    )


def _make_purchase(
    *,
    last_checked_at: datetime | None,
    window_expires: datetime,
    monitoring_cadence_minutes: int = 60,
    status: str = "monitoring",
    naive: bool = False,
) -> Purchase:
    """Build a Purchase with controllable monitoring fields, leaving the rest stable."""
    if naive:
        last_checked_at = (
            last_checked_at.replace(tzinfo=None) if last_checked_at is not None else None
        )
        window_expires = window_expires.replace(tzinfo=None)
    purchase_date = datetime.now(UTC) - timedelta(days=1)
    if naive:
        purchase_date = purchase_date.replace(tzinfo=None)
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
        purchase_date=purchase_date,
        purchase_date_basis="order_date",
        window_expires=window_expires,
        order_id="BBY-123",
        member_tier_at_purchase=None,
        status=status,
        claim_type="self_service",
        monitoring_cadence_minutes=monitoring_cadence_minutes,
        last_checked_at=last_checked_at,
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


class _FakeDB:
    def __init__(
        self,
        purchases: list[Purchase],
        *,
        policies: dict[str, Policy] | None = None,
        claims: list[Claim] | None = None,
    ) -> None:
        self.purchases = purchases
        self.updates: list[tuple[object, dict[str, object]]] = []
        self.price_history: list[PriceHistory] = []
        # Default: every platform that shows up in tests gets a permissive
        # policy so the eligibility wiring (added in 3.11) doesn't bump
        # `no_policy` in tests that pre-date it. Override via the kwarg to
        # exercise the no_policy / ineligible counters.
        self.policies = policies if policies is not None else {"best_buy": _default_policy()}
        self.claims: list[Claim] = list(claims) if claims else []

    async def find_purchases(self, _filter: dict[str, object], limit: int = 100) -> list[Purchase]:
        return self.purchases[:limit]

    async def partial_update(
        self,
        _collection: str,
        purchase_id: object,
        updates: dict[str, object],
        _model: object,
    ) -> bool:
        self.updates.append((purchase_id, updates))
        return True

    async def insert_price_history(self, record: PriceHistory) -> str:
        self.price_history.append(record)
        return str(record.id)

    async def get_policy(self, platform: str) -> Policy | None:
        return self.policies.get(platform)

    async def find_claims(
        self,
        filter: dict[str, object],
        limit: int = 100,
        sort: list[tuple[str, int]] | None = None,
    ) -> list[Claim]:
        purchase_id = filter.get("purchase_id")
        matches = [c for c in self.claims if purchase_id is None or c.purchase_id == purchase_id]
        if sort:
            # Mirror the cron call: sort by updated_at desc. Treat None as -inf
            # so freshly-seeded claims with no updated_at sort last.
            field, direction = sort[0]
            matches.sort(
                key=lambda c: getattr(c, field) or datetime.min.replace(tzinfo=UTC),
                reverse=direction == -1,
            )
        return matches[:limit]

    async def upsert_claim(self, claim: Claim) -> str:
        # Mirror the real upsert: stamp updated_at to now-UTC on every write so
        # the dedup gate has a value to compare against.
        object.__setattr__(claim, "updated_at", datetime.now(UTC))
        self.claims.append(claim)
        return str(claim.id)


class _StubAdapter(PriceSourceAdapter):
    """Returns a controlled PriceSnapshot. Source defaults to enum-clean `direct`."""

    def __init__(self, source: str = "direct") -> None:
        self.source = source
        self.calls: int = 0

    async def fetch_current_price(
        self,
        platform: str,
        product_id: str,
        product_url: str | None = None,
        member_tier: str | None = None,
    ) -> PriceSnapshot:
        self.calls += 1
        return PriceSnapshot(
            platform=platform,
            product_id=product_id,
            price_member=None,
            price_non_member=299.99,
            member_tier_required=None,
            currency="USD",
            checked_at=datetime.now(UTC),
            source=self.source,
        )


class _ErrorAdapter(PriceSourceAdapter):
    def __init__(self) -> None:
        self.calls: int = 0

    async def fetch_current_price(
        self,
        platform: str,
        product_id: str,
        product_url: str | None = None,
        member_tier: str | None = None,
    ) -> PriceSnapshot:
        self.calls += 1
        raise PriceFetchError(platform, product_id, "stubbed adapter failure")


def _last_checked_update(db: _FakeDB, purchase_id: object) -> dict[str, object] | None:
    for pid, updates in db.updates:
        if pid == purchase_id and "last_checked_at" in updates:
            return updates
    return None


class TestRunCron(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        # Stub `publish_event` for every test in this class — the cron's new
        # `_handle_eligible_drop` path (ticket 3.12) would otherwise reach
        # real GCP Pub/Sub via `_StubAdapter`'s drop-triggering snapshot.
        # Tests that need to inspect publish calls override `self.publish_mock`.
        self.publish_mock = AsyncMock(return_value="msg-test")
        self._publish_patcher = patch.object(cron_module, "publish_event", self.publish_mock)
        self._publish_patcher.start()
        self.addCleanup(self._publish_patcher.stop)

    async def test_naive_mongo_datetimes_do_not_crash_cadence_checks(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=now,
            window_expires=now + timedelta(days=2),
            monitoring_cadence_minutes=60,
            naive=True,
        )
        db = _FakeDB([purchase])

        summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["scanned"], 1)
        self.assertEqual(summary["due"], 0)
        self.assertEqual(summary["errors"], 0)
        self.assertEqual(purchase.window_expires.tzinfo, UTC)
        self.assertEqual(purchase.last_checked_at.tzinfo, UTC)

    async def test_due_purchase_fetches_and_bumps_last_checked_at(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["scanned"], 1)
        self.assertEqual(summary["due"], 1)
        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(summary["errors"], 0)
        self.assertEqual(summary["skipped_source"], 0)
        self.assertEqual(adapter.calls, 1)
        self.assertEqual(len(db.price_history), 1)
        self.assertIsNotNone(_last_checked_update(db, purchase.id))

    async def test_adapter_error_still_bumps_last_checked_at(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])
        adapter = _ErrorAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["due"], 1)
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(summary["errors"], 1)
        self.assertEqual(adapter.calls, 1)
        self.assertEqual(len(db.price_history), 0)
        # The guarantee Chris flagged: a broken adapter must not hot-loop.
        self.assertIsNotNone(_last_checked_update(db, purchase.id))

    async def test_adapter_error_records_monitor_error_fields(self) -> None:
        """BUG-19: persistent adapter failures must leave a trail the UI can
        read — code + human-readable reason + timestamp — so the purchase
        detail page can replace its hopeful 'waiting for snapshot' copy with
        a real explanation and (where applicable) a remediation action.
        """
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])

        class _MissingUrlAdapter(PriceSourceAdapter):
            async def fetch_current_price(
                self,
                platform: str,
                product_id: str,
                product_url: str | None = None,
                member_tier: str | None = None,
            ) -> PriceSnapshot:
                raise PriceFetchError(platform, product_id, "Best Buy adapter requires product_url")

        with patch.object(cron_module, "get_adapter", return_value=_MissingUrlAdapter()):
            await run_cron(db)  # type: ignore[arg-type]

        error_updates = [
            u for pid, u in db.updates if pid == purchase.id and "last_monitor_error" in u
        ]
        self.assertEqual(len(error_updates), 1)
        update = error_updates[0]
        self.assertEqual(update["last_monitor_error_code"], "missing_product_url")
        self.assertEqual(update["last_monitor_error"], "Best Buy adapter requires product_url")
        self.assertIsNotNone(update["last_monitor_error_at"])

    async def test_classify_fetch_error_matches_case_insensitive_phrasing(self) -> None:
        """Regression for CodeRabbit comment on PR #233: a future adapter that
        phrases the failure as "Product URL is required" must still classify
        as missing_product_url, not as the generic adapter_error bucket.
        """
        from src.cron import _classify_fetch_error

        # Current Best Buy phrasing.
        self.assertEqual(
            _classify_fetch_error("Best Buy adapter requires product_url"),
            "missing_product_url",
        )
        # Hypothetical future phrasings — title case, with spaces, padding.
        self.assertEqual(
            _classify_fetch_error("Product URL is required"),
            "missing_product_url",
        )
        self.assertEqual(
            _classify_fetch_error("  Missing Product URL  "),
            "missing_product_url",
        )
        # Sanity check: unrelated failure still goes to the generic bucket.
        self.assertEqual(
            _classify_fetch_error("Target adapter HTTP 500"),
            "adapter_error",
        )

    async def test_adapter_error_uses_generic_code_for_other_failures(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])

        with patch.object(cron_module, "get_adapter", return_value=_ErrorAdapter()):
            await run_cron(db)  # type: ignore[arg-type]

        error_updates = [
            u for pid, u in db.updates if pid == purchase.id and "last_monitor_error" in u
        ]
        self.assertEqual(len(error_updates), 1)
        self.assertEqual(error_updates[0]["last_monitor_error_code"], "adapter_error")
        self.assertEqual(error_updates[0]["last_monitor_error"], "stubbed adapter failure")

    async def test_successful_fetch_clears_stale_monitor_error_fields(self) -> None:
        """Once an adapter recovers (or the user adds a product_url), the next
        successful fetch must wipe the failure trail so the UI returns to the
        standard waiting/healthy state.
        """
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        # Seed prior failure state on the in-memory purchase.
        object.__setattr__(purchase, "last_monitor_error", "Best Buy adapter requires product_url")
        object.__setattr__(purchase, "last_monitor_error_at", now - timedelta(hours=1))
        object.__setattr__(purchase, "last_monitor_error_code", "missing_product_url")
        db = _FakeDB([purchase])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            await run_cron(db)  # type: ignore[arg-type]

        clears = [
            u
            for pid, u in db.updates
            if pid == purchase.id and u.get("last_monitor_error_code", "skip") is None
        ]
        self.assertEqual(len(clears), 1)
        cleared = clears[0]
        self.assertIsNone(cleared["last_monitor_error"])
        self.assertIsNone(cleared["last_monitor_error_at"])
        self.assertIsNone(cleared["last_monitor_error_code"])

    async def test_successful_fetch_does_not_rewrite_when_no_prior_error(self) -> None:
        """Avoid unnecessary Mongo writes on the healthy path — the clear-error
        partial_update only runs when at least one error field was non-null.
        """
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            await run_cron(db)  # type: ignore[arg-type]

        clears = [
            u for pid, u in db.updates if pid == purchase.id and "last_monitor_error_code" in u
        ]
        self.assertEqual(clears, [])

    async def test_expired_window_is_skipped_without_fetch(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now - timedelta(hours=1),
        )
        db = _FakeDB([purchase])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["skipped_expired"], 1)
        self.assertEqual(summary["due"], 0)
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(adapter.calls, 0)
        self.assertIsNone(_last_checked_update(db, purchase.id))
        # The stored status is flipped monitoring -> expired so the UI stops
        # reporting "monitoring" for a closed window; last_checked_at is NOT
        # bumped (the row was never fetched).
        status_updates = [u for pid, u in db.updates if pid == purchase.id and "status" in u]
        self.assertEqual(status_updates, [{"status": "expired"}])
        self.assertEqual(summary["errors"], 0)

    async def test_cadence_drift_persists_new_value(self) -> None:
        now = datetime.now(UTC)
        # Window of ~3 days → MID (60 min); stored cadence is LONG (360) → drift.
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
            monitoring_cadence_minutes=360,
        )
        db = _FakeDB([purchase])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            await run_cron(db)  # type: ignore[arg-type]

        cadence_updates = [u for pid, u in db.updates if "monitoring_cadence_minutes" in u]
        self.assertEqual(len(cadence_updates), 1)
        self.assertEqual(cadence_updates[0]["monitoring_cadence_minutes"], 60)

    async def test_partial_update_failure_does_not_abort_sweep(self) -> None:
        """A flaky DB write on one purchase must not skip the remaining ones."""
        now = datetime.now(UTC)
        purchase_a = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        purchase_b = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase_a, purchase_b])
        adapter = _StubAdapter()

        # First partial_update call (the cadence-drift write for A, since both
        # purchases start at cadence=60 and the target is 60, this site is not
        # hit. The first write that runs is the last_checked_at update in
        # finally for A). Make that one raise.
        real_partial_update = db.partial_update
        call_state = {"raised": False}

        async def flaky_partial_update(*args, **kwargs):  # type: ignore[no-untyped-def]
            if not call_state["raised"]:
                call_state["raised"] = True
                raise RuntimeError("simulated mongo blip")
            return await real_partial_update(*args, **kwargs)

        db.partial_update = flaky_partial_update  # type: ignore[method-assign]

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        # Both purchases were scanned; A's write failed (errors=1) but B's
        # fetch + write still ran.
        self.assertEqual(summary["scanned"], 2)
        self.assertEqual(summary["fetched"], 2)
        self.assertEqual(summary["errors"], 1)
        self.assertEqual(adapter.calls, 2)

    async def test_seeded_source_does_not_persist_price_history(self) -> None:
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])
        adapter = _StubAdapter(source="seeded")

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(summary["skipped_source"], 1)
        self.assertEqual(len(db.price_history), 0)

    async def test_degraded_purchase_is_skipped_with_warning(self) -> None:
        """Read-tolerance contract (PR #142): a Purchase with null
        critical fields must not 500 the sweep. The bad doc is logged
        and skipped; valid docs in the same batch still get processed.
        """
        now = datetime.now(UTC)

        # Construct via the read-tolerant variant directly (the strict
        # `Purchase` would reject these). This matches what
        # `db.find_purchases` returns at runtime.
        degraded = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform=None,
            category=None,
            product_name=None,
            product_id=None,
            price_paid=None,
            currency="USD",
            purchase_date=None,
            window_expires=None,
            order_id=None,
            status="monitoring",
            claim_type=None,
            monitoring_cadence_minutes=None,
            ingested_at=now,
            ingestion_source=None,
        )
        good = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )

        db = _FakeDB([degraded, good])  # type: ignore[list-item]
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        # Degraded was skipped (counter), good was fetched.
        self.assertEqual(summary["scanned"], 2)
        self.assertEqual(summary["skipped_degraded"], 1)
        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(adapter.calls, 1)

    async def test_zero_or_negative_cadence_is_treated_as_degraded(self) -> None:
        """`monitoring_cadence_minutes <= 0` would make `is_due` always
        true (since `last_checked_at + 0 <= now`), tight-looping the
        sweep on the same purchase. Read-tolerance widens the field to
        `int | None`, so a stored 0 / negative value can slip past a
        plain `is None` check. Verify the cron treats it as degraded
        and skips with a warning instead.
        """
        now = datetime.now(UTC)
        zero_cadence = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform="best_buy",
            category="retail",
            product_name="Test",
            product_id="ABC",
            price_paid=10.0,
            currency="USD",
            purchase_date=now,
            window_expires=now + timedelta(days=3),
            order_id="ord-1",
            status="monitoring",
            claim_type="email",
            monitoring_cadence_minutes=0,
            ingested_at=now,
            ingestion_source="gmail",
        )
        negative_cadence = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform="best_buy",
            category="retail",
            product_name="Test",
            product_id="ABC",
            price_paid=10.0,
            currency="USD",
            purchase_date=now,
            window_expires=now + timedelta(days=3),
            order_id="ord-1",
            status="monitoring",
            claim_type="email",
            monitoring_cadence_minutes=-15,
            ingested_at=now,
            ingestion_source="gmail",
        )
        db = _FakeDB([zero_cadence, negative_cadence])  # type: ignore[list-item]
        adapter = _StubAdapter()
        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        # Both got the degraded skip — neither was fetched.
        self.assertEqual(summary["scanned"], 2)
        self.assertEqual(summary["skipped_degraded"], 2)
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(adapter.calls, 0)

    async def test_non_positive_price_paid_is_treated_as_degraded(self) -> None:
        """Eligibility computes drop percentage from price_paid, so tolerant
        rows that bypass strict `gt=0` validation must be skipped before
        they can divide by zero or produce nonsensical drops.
        """
        now = datetime.now(UTC)
        zero_price = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform="best_buy",
            category="retail",
            product_name="Test",
            product_id="ABC",
            price_paid=0.0,
            currency="USD",
            purchase_date=now,
            window_expires=now + timedelta(days=3),
            order_id="ord-1",
            status="monitoring",
            claim_type="email",
            monitoring_cadence_minutes=60,
            ingested_at=now,
            ingestion_source="gmail",
        )
        negative_price = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform="best_buy",
            category="retail",
            product_name="Test",
            product_id="ABC",
            price_paid=-10.0,
            currency="USD",
            purchase_date=now,
            window_expires=now + timedelta(days=3),
            order_id="ord-1",
            status="monitoring",
            claim_type="email",
            monitoring_cadence_minutes=60,
            ingested_at=now,
            ingestion_source="gmail",
        )
        db = _FakeDB([zero_price, negative_price])  # type: ignore[list-item]
        adapter = _StubAdapter()
        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["scanned"], 2)
        self.assertEqual(summary["skipped_degraded"], 2)
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(adapter.calls, 0)

    async def test_missing_category_is_treated_as_degraded_before_eligibility(self) -> None:
        """A missing category would skip category-specific validator rules and
        could count a legacy row as eligible, so reject it at the cron gate.
        """
        now = datetime.now(UTC)
        rogue = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform="best_buy",
            category=None,
            product_name="Test",
            product_id="ABC",
            price_paid=10.0,
            currency="USD",
            purchase_date=now,
            window_expires=now + timedelta(days=3),
            order_id="ord-1",
            status="monitoring",
            claim_type="email",
            monitoring_cadence_minutes=60,
            ingested_at=now,
            ingestion_source="gmail",
        )
        db = _FakeDB([rogue])  # type: ignore[list-item]
        adapter = _StubAdapter()
        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["skipped_degraded"], 1)
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(adapter.calls, 0)

    async def test_hotel_without_check_in_basis_is_treated_as_degraded(self) -> None:
        """Hotel pre-arrival rules need purchase_date to be the check-in
        datetime; otherwise Wyndham-style policies can be over-approved.
        """
        now = datetime.now(UTC)
        rogue = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform="hilton",
            category="hotel",
            product_name="Test Hotel",
            product_id="HTL-1",
            price_paid=100.0,
            currency="USD",
            purchase_date=now,
            purchase_date_basis="order_date",
            window_expires=now + timedelta(days=3),
            order_id="ord-1",
            member_tier_at_purchase="hilton_diamond",
            status="monitoring",
            claim_type="email",
            monitoring_cadence_minutes=60,
            ingested_at=now,
            ingestion_source="gmail",
        )
        db = _FakeDB([rogue])  # type: ignore[list-item]
        adapter = _StubAdapter()
        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["skipped_degraded"], 1)
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(adapter.calls, 0)

    async def test_unknown_platform_purchase_is_skipped(self) -> None:
        """A purchase whose `platform` string isn't in the current Platform
        enum is also a degraded doc — adapter routing would crash on it."""
        now = datetime.now(UTC)
        rogue = PurchaseReadTolerant.model_construct(
            id=uuid4(),
            user_id=uuid4(),
            platform="defunct_marketplace",
            category="retail",
            product_name="Test",
            product_id="ABC",
            price_paid=10.0,
            currency="USD",
            purchase_date=now,
            window_expires=now + timedelta(days=3),
            order_id="ord-1",
            status="monitoring",
            claim_type="email",
            monitoring_cadence_minutes=60,
            ingested_at=now,
            ingestion_source="gmail",
        )
        db = _FakeDB([rogue])  # type: ignore[list-item]
        adapter = _StubAdapter()
        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["skipped_degraded"], 1)
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(adapter.calls, 0)

    # -- eligibility wiring (ticket 3.11) -------------------------------

    async def test_eligible_drop_bumps_eligible_counter(self) -> None:
        """Snapshot under price_paid + permissive policy → eligible=1."""
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])  # default policies = best_buy permissive
        adapter = _StubAdapter()  # returns 299.99 < paid 349.99 → is a drop

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(summary["eligible"], 1)
        self.assertEqual(summary["ineligible"], 0)
        self.assertEqual(summary["no_policy"], 0)

    async def test_no_drop_does_not_bump_eligibility_counters(self) -> None:
        """No drop → comparison.is_eligible=False → neither counter changes."""
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])

        class _SamePriceAdapter(PriceSourceAdapter):
            async def fetch_current_price(
                self,
                platform: str,
                product_id: str,
                product_url: str | None = None,
                member_tier: str | None = None,
            ) -> PriceSnapshot:
                return PriceSnapshot(
                    platform=platform,
                    product_id=product_id,
                    price_member=None,
                    price_non_member=349.99,  # same as price_paid
                    member_tier_required=None,
                    currency="USD",
                    checked_at=datetime.now(UTC),
                    source="direct",
                )

        with patch.object(cron_module, "get_adapter", return_value=_SamePriceAdapter()):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(summary["eligible"], 0)
        self.assertEqual(summary["ineligible"], 0)

    async def test_eligible_drop_against_inactive_policy_bumps_ineligible(self) -> None:
        """Policy with active=False routes through `no_policy` (get_policy
        filters active=True) — we exercise the *validator* rejection by
        wiring a tolerant get_policy that returns the inactive policy.
        """
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        inactive = _default_policy()
        # Mutate via __dict__ since model_construct doesn't enforce setattr semantics.
        object.__setattr__(inactive, "active", False)
        db = _FakeDB([purchase], policies={"best_buy": inactive})
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(summary["eligible"], 0)
        self.assertEqual(summary["ineligible"], 1)

    async def test_eligible_drop_with_no_policy_bumps_no_policy_counter(self) -> None:
        """Adapter returns a drop but no policy seeded for the platform."""
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase], policies={})  # empty — no policy for any platform
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(summary["eligible"], 0)
        self.assertEqual(summary["ineligible"], 0)
        self.assertEqual(summary["no_policy"], 1)

    # -- claim creation + price.dropped publish (ticket 3.12) ------------

    async def test_eligible_drop_creates_claim_and_publishes_event(self) -> None:
        """Eligible drop ⇒ one draft_pending Claim + one price.dropped event."""
        from claimit_mongodb_models import ClaimOutcome
        from claimit_pubsub import TOPIC_PRICE_DROPPED, PriceDroppedEvent

        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["eligible"], 1)
        self.assertEqual(summary["emitted"], 1)
        self.assertEqual(summary["eligible_dedup"], 0)

        # Exactly one Claim created in draft_pending, with the drop math.
        self.assertEqual(len(db.claims), 1)
        claim = db.claims[0]
        self.assertEqual(claim.outcome, ClaimOutcome.DRAFT_PENDING)
        self.assertEqual(claim.purchase_id, purchase.id)
        self.assertEqual(claim.user_id, purchase.user_id)
        self.assertAlmostEqual(claim.claim_amount, 349.99 - 299.99, places=2)
        self.assertEqual(claim.currency, "USD")
        self.assertEqual(len(claim.draft_versions), 1)
        self.assertEqual(claim.draft_content, "")

        # Exactly one publish, to the price.dropped topic, with matching payload.
        self.publish_mock.assert_awaited_once()
        topic, event = self.publish_mock.await_args.args
        self.assertEqual(topic, TOPIC_PRICE_DROPPED)
        self.assertIsInstance(event, PriceDroppedEvent)
        self.assertEqual(event.purchase_id, str(purchase.id))
        self.assertEqual(event.claim_id, str(claim.id))
        self.assertEqual(event.user_id, str(purchase.user_id))
        self.assertEqual(event.platform_id, purchase.platform)
        self.assertAlmostEqual(event.original_price, 349.99, places=2)
        self.assertAlmostEqual(event.current_price, 299.99, places=2)
        self.assertAlmostEqual(event.price_drop_amount, 349.99 - 299.99, places=2)
        self.assertAlmostEqual(event.price_drop_pct, (349.99 - 299.99) / 349.99 * 100, places=2)
        self.assertEqual(event.purchase_date, purchase.purchase_date)
        self.assertIsNotNone(event.detected_at)

    async def test_eligible_drop_within_1h_of_prior_claim_does_not_re_emit(self) -> None:
        """A second eligible detection within the 1h dedup window emits nothing."""
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )

        # Seed a Claim whose `updated_at` is 30 minutes ago — inside the
        # 1h dedup window. The cron must skip re-emitting for this purchase.
        prior_claim = Claim.model_construct(
            id=uuid4(),
            purchase_id=purchase.id,
            user_id=purchase.user_id,
            updated_at=now - timedelta(minutes=30),
        )
        db = _FakeDB([purchase], claims=[prior_claim])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["eligible"], 1)
        self.assertEqual(summary["emitted"], 0)
        self.assertEqual(summary["eligible_dedup"], 1)
        # No new Claim — only the seeded one remains.
        self.assertEqual(len(db.claims), 1)
        self.assertIs(db.claims[0], prior_claim)
        self.publish_mock.assert_not_awaited()

    async def test_eligible_drop_after_1h_of_prior_claim_re_emits(self) -> None:
        """A prior Claim older than the dedup window does not block re-emission."""
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        stale_claim = Claim.model_construct(
            id=uuid4(),
            purchase_id=purchase.id,
            user_id=purchase.user_id,
            updated_at=now - timedelta(hours=2),
        )
        db = _FakeDB([purchase], claims=[stale_claim])
        adapter = _StubAdapter()

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["emitted"], 1)
        self.assertEqual(summary["eligible_dedup"], 0)
        # Stale + freshly-written = 2 claims.
        self.assertEqual(len(db.claims), 2)
        self.publish_mock.assert_awaited_once()

    async def test_publish_failure_counts_as_error_but_persists_claim(self) -> None:
        """Persist-then-publish: if Pub/Sub raises, the Claim still lands so the
        next tick's dedup gate prevents duplicate emission. Counted in `errors`.
        """
        now = datetime.now(UTC)
        purchase = _make_purchase(
            last_checked_at=None,
            window_expires=now + timedelta(days=3),
        )
        db = _FakeDB([purchase])
        adapter = _StubAdapter()
        self.publish_mock.side_effect = RuntimeError("simulated pubsub blip")

        with patch.object(cron_module, "get_adapter", return_value=adapter):
            summary = await run_cron(db)  # type: ignore[arg-type]

        self.assertEqual(summary["eligible"], 1)
        self.assertEqual(summary["emitted"], 0)
        self.assertEqual(summary["errors"], 1)
        # Claim was persisted before the publish failure.
        self.assertEqual(len(db.claims), 1)
        self.publish_mock.assert_awaited_once()
