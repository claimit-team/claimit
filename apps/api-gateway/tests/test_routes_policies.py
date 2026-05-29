"""Tests for GET /api/v1/policies/{platform} (BUG-59).

Three cases: 200 with a seeded Best Buy policy, 404 for an unseeded
platform, 401 unauthenticated. Auth/fixture style mirrors
test_routes_settings.py and test_routes_purchases.py.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from claimit_mongodb_models import MongoDBClient, Policy
from httpx import AsyncClient
from src.deps import get_db
from src.main import app

_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}


def _policy_fixture(
    *,
    platform: str = "best_buy",
    window_days: int = 15,
    window_days_member: int | None = 30,
) -> dict[str, object]:
    return {
        "_id": "00000000-0000-4000-8000-aaaaaaaaaaaa",
        "updated_at": datetime.now(UTC).isoformat(),
        "platform": platform,
        "category": "retail",
        "window_days": window_days,
        "window_days_member": window_days_member,
        "pre_arrival_hours_required": None,
        "covers_own_drops": True,
        "covers_competitor_drops": False,
        "claim_type": "self_service",
        "claim_url": "https://example.com",
        "claim_email": None,
        "claim_phone": None,
        "loyalty_required": False,
        "award_ticket_eligible": None,
        "bundle_exclusions": False,
        "key_exclusions": [],
        "policy_url": "https://example.com",
        "policy_text_full": "f",
        "policy_text_relevant_clause": "c",
        "last_verified": datetime.now(UTC).isoformat(),
        "active": True,
    }


@pytest.mark.asyncio
async def test_get_policy_window_happy_path(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(window_days=15, window_days_member=30))
    )

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/policies/best_buy",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload == {
            "platform": "best_buy",
            "window_days": 15,
            "window_days_member": 30,
            "claim_type": "self_service",
        }
        db.get_policy.assert_awaited_once_with("best_buy")
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_policy_window_returns_404_when_missing(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.get_policy = AsyncMock(return_value=None)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/policies/amazon",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "policy_not_found"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_policy_window_requires_bearer(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.get("/api/v1/policies/best_buy")
        assert response.status_code == 401
        db.get_policy.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_policy_window_rejects_unknown_platform(client: AsyncClient) -> None:
    """FastAPI enum-validates the path param → 422 before db is consulted."""
    db = AsyncMock(spec=MongoDBClient)
    db.get_policy = AsyncMock(return_value=None)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/policies/not_a_real_platform",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 422
        db.get_policy.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)
