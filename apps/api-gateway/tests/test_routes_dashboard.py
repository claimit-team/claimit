"""Tests for GET /api/v1/dashboard/summary."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from claimit_mongodb_models import MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db
from src.main import app

from ._fixtures import USER_FIXTURE

_USER = User.model_validate(USER_FIXTURE)


def _mock_db_for_route() -> AsyncMock:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=_USER)
    db.aggregate = AsyncMock(
        return_value=[
            {
                "savings_month": [{"_id": None, "total": 125.5}],
                "savings_lifetime": [{"_id": None, "total": 875.0}],
                "active_count": [{"count": 2}],
                "recent_resolved": [
                    {
                        "claim_id": "20000000-0000-0000-0000-000000000001",
                        "platform": "best_buy",
                        "outcome": "approved",
                        "amount": 50.0,
                    }
                ],
            }
        ]
    )
    db.count = AsyncMock(return_value=3)
    return db


@pytest.mark.asyncio
async def test_dashboard_summary_returns_200_with_expected_shape(
    client: AsyncClient,
) -> None:
    db = _mock_db_for_route()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            return_value={"uid": "test-uid", "email": "test@example.com"},
        ):
            response = await client.get(
                "/api/v1/dashboard/summary",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["total_savings_month"] == 125.5
        assert payload["total_savings_lifetime"] == 875.0
        assert payload["active_claims_count"] == 2
        assert payload["monitoring_purchases_count"] == 3
        assert len(payload["recent_resolved"]) == 1
        assert payload["recent_resolved"][0]["platform"] == "best_buy"
        assert payload["recent_resolved"][0]["outcome"] == "approved"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_dashboard_summary_requires_bearer(client: AsyncClient) -> None:
    """No Authorization header → 401 from get_current_user dependency.

    get_db must still be overridden because FastAPI resolves all dependencies
    eagerly (and lifespan never runs under ASGITransport, so deps._db is None
    by default). Same pattern as test_routes_gmail_connect.py.
    """
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.get("/api/v1/dashboard/summary")
        assert response.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_dashboard_summary_passes_authenticated_user_id_to_service(
    client: AsyncClient,
) -> None:
    db = _mock_db_for_route()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            return_value={"uid": "test-uid", "email": "test@example.com"},
        ):
            await client.get(
                "/api/v1/dashboard/summary",
                headers={"Authorization": "Bearer valid-token"},
            )
        # Service called aggregate("claims", pipeline) with user._id in the
        # first $match stage.
        db.aggregate.assert_called_once()
        pipeline = db.aggregate.call_args.args[1]
        first_match = pipeline[0]["$match"]
        assert first_match["user_id"] == _USER.id
    finally:
        app.dependency_overrides.pop(get_db, None)
