"""Tests for /api/v1/auth/me."""

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
async def test_auth_me_returns_user(client: AsyncClient) -> None:
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
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert "user" in payload
        assert payload["user"]["email"] == "test@example.com"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_auth_me_strips_refresh_token_ref(client: AsyncClient) -> None:
    fixture = copy.deepcopy(USER_FIXTURE)
    fixture["gmail_integration"]["refresh_token_ref"] = (  # type: ignore[index]
        "projects/x/secrets/gmail-refresh-token-y/versions/1"
    )
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
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        gmail = response.json()["user"]["gmail_integration"]
        assert "refresh_token_ref" not in gmail
        assert gmail["connected"] is False
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_auth_me_unauthenticated_returns_401(client: AsyncClient) -> None:
    # FastAPI resolves all dependencies eagerly, so get_db must be overridden
    # even though get_current_user raises before touching it.
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"
    finally:
        app.dependency_overrides.pop(get_db, None)
