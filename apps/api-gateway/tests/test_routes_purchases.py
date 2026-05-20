"""Tests for /api/v1/purchases/{id}/confirm and /dismiss."""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import (
    SKIPLIST_MAX_ENTRIES,
    MongoDBClient,
    Purchase,
    PurchaseStatus,
    User,
)
from httpx import AsyncClient
from src.deps import get_db
from src.main import app
from src.middleware.auth import get_current_user

from ._fixtures import USER_FIXTURE

PURCHASE_ID = UUID("22222222-2222-4222-8222-222222222222")
USER_ID = UUID("00000000-0000-0000-0000-000000000001")


async def _override_user() -> User:
    return User.model_validate(USER_FIXTURE)


def _purchase_fixture(status: str = "pending_confirmation") -> Purchase:
    now = datetime.now(UTC)
    return Purchase.model_validate(
        {
            "_id": str(PURCHASE_ID),
            "updated_at": now.isoformat(),
            "user_id": str(USER_ID),
            "platform": "best_buy",
            "category": "retail",
            "product_name": "Widget",
            "product_id": "W123",
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 24.99,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "currency": "USD",
            "purchase_date": now.isoformat(),
            "purchase_date_basis": "order_date",
            "window_expires": now.isoformat(),
            "order_id": "A123",
            "member_tier_at_purchase": None,
            "status": status,
            "claim_type": "self_service",
            "monitoring_cadence_minutes": 360,
            "ingested_at": now.isoformat(),
            "ingestion_source": "gmail",
            "receipt_storage_url": None,
            "receipt_hash": "sha256:abc123",
            "format_hash": "sha256:format123",
            "sender": "orders@retailer.example",
            "extraction_confidence": {
                "platform": 0.94,
                "price": 0.94,
                "overall_min": 0.94,
            },
        }
    )


@pytest.mark.asyncio
async def test_confirm_purchase_sets_monitoring(client: AsyncClient) -> None:
    purchase = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == PurchaseStatus.MONITORING
        mock_db.partial_update.assert_awaited_once()
        update_args = mock_db.partial_update.await_args
        assert update_args.args[2]["status"] == PurchaseStatus.MONITORING
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_confirm_purchase_rejects_wrong_status(client: AsyncClient) -> None:
    purchase = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 409
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_duplicate_sets_dismissed(client: AsyncClient) -> None:
    purchase = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "duplicate"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == PurchaseStatus.DISMISSED
        assert payload["reason"] == "duplicate"
        assert payload["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_not_an_order_writes_skiplist(client: AsyncClient) -> None:
    purchase = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order", "sender": "promo@retailer.example"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == PurchaseStatus.DISMISSED
        assert payload["reason"] == "not_an_order"
        assert payload["skiplist_written"] is True
        mock_db.upsert.assert_awaited_once()
        upserted_user = mock_db.upsert.await_args.args[2]
        assert len(upserted_user.ingestion_skiplist) == 1
        entry = upserted_user.ingestion_skiplist[0]
        assert entry.sender == "promo@retailer.example"
        assert entry.format_hash == "sha256:format123"
        assert entry.reason == "not_an_order"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_not_an_order_without_format_hash_skips_skiplist(
    client: AsyncClient,
) -> None:
    """Legacy purchases without format_hash cannot create classifier-matchable skiplist entries."""
    purchase = _purchase_fixture()
    purchase.format_hash = None
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order", "sender": "promo@retailer.example"},
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_not_an_order_prefers_purchase_format_hash(client: AsyncClient) -> None:
    """When the purchase has format_hash set, the skiplist entry uses it (not receipt_hash)."""
    purchase = _purchase_fixture()
    purchase.format_hash = "sha256:format-from-extractor"
    purchase.sender = "newsletter@retailer.example"
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order"},  # sender omitted; falls back to purchase.sender
        )
        assert response.status_code == 200
        upserted_user = mock_db.upsert.await_args.args[2]
        entry = upserted_user.ingestion_skiplist[0]
        assert entry.format_hash == "sha256:format-from-extractor"
        assert entry.sender == "newsletter@retailer.example"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_not_an_order_enforces_1000_entry_cap(client: AsyncClient) -> None:
    """Adding a new entry past the cap evicts oldest entries (FIFO)."""
    purchase = _purchase_fixture()
    purchase.format_hash = "sha256:brand-new-format"
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))

    base_now = datetime.now(UTC)
    user_doc = copy.deepcopy(USER_FIXTURE)
    user_doc["ingestion_skiplist"] = [
        {
            "sender": f"sender-{i}@example.com",
            "format_hash": f"sha256:hash-{i}",
            "added_at": base_now.isoformat(),
            "reason": "not_an_order",
        }
        for i in range(SKIPLIST_MAX_ENTRIES)
    ]

    async def _override_user_full() -> User:
        return User.model_validate(user_doc)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user_full
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order", "sender": "new@example.com"},
        )
        assert response.status_code == 200
        upserted_user = mock_db.upsert.await_args.args[2]
        assert len(upserted_user.ingestion_skiplist) == SKIPLIST_MAX_ENTRIES
        # Oldest entry (index 0) evicted; newest appended at the tail.
        assert upserted_user.ingestion_skiplist[0].sender == "sender-1@example.com"
        assert upserted_user.ingestion_skiplist[-1].sender == "new@example.com"
        assert upserted_user.ingestion_skiplist[-1].format_hash == "sha256:brand-new-format"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_not_an_order_dedupes_existing_entry(client: AsyncClient) -> None:
    """Repeat dismiss of same (sender, format_hash) does not duplicate the entry."""
    purchase = _purchase_fixture()
    purchase.format_hash = "sha256:existing-format"
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))

    user_doc = copy.deepcopy(USER_FIXTURE)
    user_doc["ingestion_skiplist"] = [
        {
            "sender": "promo@retailer.example",
            "format_hash": "sha256:existing-format",
            "added_at": datetime.now(UTC).isoformat(),
            "reason": "not_an_order",
        }
    ]

    async def _override_user_full() -> User:
        return User.model_validate(user_doc)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user_full
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order", "sender": "promo@retailer.example"},
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_not_an_order_skiplist_failure_is_best_effort(client: AsyncClient) -> None:
    """When db.upsert fails during skiplist write, dismiss still succeeds with skiplist_written=false."""
    purchase = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(side_effect=RuntimeError("simulated DB failure"))

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order", "sender": "promo@retailer.example"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == PurchaseStatus.DISMISSED
        assert payload["reason"] == "not_an_order"
        assert payload["skiplist_written"] is False
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
