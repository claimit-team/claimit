"""Tests for monitor-agent cron orchestration."""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

from claimit_mongodb_models import PriceHistory, Purchase, PurchaseReadTolerant
from src import cron as cron_module
from src.adapters.base import PriceFetchError, PriceSnapshot, PriceSourceAdapter
from src.cron import run_cron


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
    def __init__(self, purchases: list[Purchase]) -> None:
        self.purchases = purchases
        self.updates: list[tuple[object, dict[str, object]]] = []
        self.price_history: list[PriceHistory] = []

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
