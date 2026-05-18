"""Tests for /api/v1/gmail/status."""

from __future__ import annotations

import copy
from unittest.mock import AsyncMock, patch

import pytest
from claimit_mongodb_models import MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db
from src.main import app

from ._fixtures import USER_FIXTURE


@pytest.mark.asyncio
async def test_gmail_status_disconnected(client: AsyncClient) -> None:
    user = User.model_validate(USER_FIXTURE)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            return_value={"uid": "test-uid", "email": "test@example.com"},
        ):
            response = await client.get(
                "/api/v1/gmail/status",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload == {"connected": False, "email": None, "scopes": []}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_gmail_status_connected(client: AsyncClient) -> None:
    # When connected, /status surfaces the connected Gmail address from the
    # User.gmail_integration.connected_email field (set by /callback after the
    # 4.14 OAuth flow), not user.email (which is the Firebase login email).
    fixture = copy.deepcopy(USER_FIXTURE)
    fixture["gmail_integration"]["connected"] = True  # type: ignore[index]
    fixture["gmail_integration"]["connected_email"] = "gmail-account@gmail.com"  # type: ignore[index]
    fixture["gmail_integration"]["scopes_granted"] = [  # type: ignore[index]
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ]
    user = User.model_validate(fixture)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            return_value={"uid": "test-uid", "email": "test@example.com"},
        ):
            response = await client.get(
                "/api/v1/gmail/status",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["connected"] is True
        assert payload["email"] == "gmail-account@gmail.com"
        assert len(payload["scopes"]) == 2
    finally:
        app.dependency_overrides.pop(get_db, None)
