"""Unit tests for the Firebase auth middleware."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import firebase_admin.auth
import pytest
from claimit_mongodb_models import User
from httpx import AsyncClient
from src.main import app, get_db

# Minimal User document that satisfies all required fields.
_USER_FIXTURE: dict = {
    "_id": "00000000-0000-0000-0000-000000000001",
    "updated_at": None,
    "email": "test@example.com",
    "name": "Test User",
    "default_location": {"city": "San Francisco", "state": "CA", "lat": 37.7749, "lon": -122.4194},
    "loyalty_memberships": [],
    "gmail_integration": {
        "connected": False,
        "connected_at": None,
        "scopes_granted": [],
        "refresh_token_ref": None,
        "watch_history_id": None,
        "watch_expires_at": None,
        "last_processed_message_id": None,
    },
    "send_preference": {
        "default_mode": "approval",
        "auto_send_delay_seconds": 0,
        "changed_at": None,
    },
    "ingestion_skiplist": [],
    "notification_prefs": {"web_push": False, "email": True},
    "subscription": {"tier": "free", "trial_ends": None, "renewed_at": None},
    "created_at": "2024-01-01T00:00:00Z",
}


@pytest.mark.asyncio
async def test_invalid_token_returns_401(client: AsyncClient) -> None:
    mock_db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=firebase_admin.auth.InvalidIdTokenError("bad token"),
        ):
            response = await client.post(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer fake-token"},
            )
        assert response.status_code == 401
        assert response.json() == {
            "error": {"code": "unauthorized", "message": "Invalid or expired token"}
        }
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_valid_token_returns_user(client: AsyncClient) -> None:
    user = User.model_validate(_USER_FIXTURE)
    mock_db = AsyncMock()
    mock_db.find_one.return_value = user
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            return_value={"uid": "test-uid", "email": "test@example.com"},
        ):
            response = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        assert response.json()["user"]["email"] == "test@example.com"
    finally:
        app.dependency_overrides.clear()
