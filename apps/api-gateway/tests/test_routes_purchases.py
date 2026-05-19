"""Tests for /api/v1/purchases/{id}/confirm and /dismiss."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient, Purchase, PurchaseStatus, User
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
        assert entry.format_hash == "sha256:abc123"
        assert entry.reason == "not_an_order"
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
