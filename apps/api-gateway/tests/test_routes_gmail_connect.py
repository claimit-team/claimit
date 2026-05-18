"""Tests for GET /api/v1/gmail/connect."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from claimit_mongodb_models import MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db, get_state_jwt_key
from src.main import app

from ._fixtures import USER_FIXTURE

_STATE_KEY = "test-state-jwt-key-for-unit-tests-do-not-use-in-production"

_FAKE_OAUTH_ENV = {
    "GMAIL_OAUTH_CLIENT_ID": "test-client-id",
    "GMAIL_OAUTH_CLIENT_SECRET": "test-client-secret",
    "GMAIL_OAUTH_REDIRECT_URI": "https://api.example.com/api/v1/gmail/callback",
}


@pytest.mark.asyncio
async def test_connect_happy_path(client: AsyncClient) -> None:
    user = User.model_validate(USER_FIXTURE)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_state_jwt_key] = lambda: _STATE_KEY
    try:
        with (
            patch(
                "firebase_admin.auth.verify_id_token",
                return_value={"uid": "test-uid", "email": "test@example.com"},
            ),
            patch.dict("os.environ", _FAKE_OAUTH_ENV),
        ):
            response = await client.get(
                "/api/v1/gmail/connect?return_to=/settings/gmail",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert "authorization_url" in payload

        parsed = urlparse(payload["authorization_url"])
        qs = parse_qs(parsed.query)
        assert "accounts.google.com" in parsed.netloc
        assert qs["access_type"] == ["offline"]
        assert qs["prompt"] == ["consent"]
        assert qs["state"][0]  # non-empty signed JWT
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_state_jwt_key, None)


@pytest.mark.asyncio
async def test_connect_invalid_return_to_rejected(client: AsyncClient) -> None:
    user = User.model_validate(USER_FIXTURE)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_state_jwt_key] = lambda: _STATE_KEY
    try:
        with (
            patch(
                "firebase_admin.auth.verify_id_token",
                return_value={"uid": "test-uid", "email": "test@example.com"},
            ),
            patch.dict("os.environ", _FAKE_OAUTH_ENV),
        ):
            response = await client.get(
                "/api/v1/gmail/connect?return_to=https://evil.com/pwn",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 400
        body = response.json()
        assert body["error"]["code"] == "invalid_return_to"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_state_jwt_key, None)


@pytest.mark.asyncio
async def test_connect_unauthenticated_returns_401(client: AsyncClient) -> None:
    # get_db must be overridden even though get_current_user raises before reaching it
    # — FastAPI resolves all deps eagerly. Same pattern as other middleware tests.
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_state_jwt_key] = lambda: _STATE_KEY
    try:
        response = await client.get("/api/v1/gmail/connect")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_state_jwt_key, None)
