"""Unit tests for the Firebase auth middleware."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import firebase_admin.auth
import pytest
from claimit_mongodb_models import MongoDBClient
from httpx import AsyncClient
from src.deps import derive_user_id, get_db
from src.main import app


def test_derive_user_id_deterministic() -> None:
    uid1 = derive_user_id("firebase-uid-abc")
    uid2 = derive_user_id("firebase-uid-abc")
    assert uid1 == uid2


def test_derive_user_id_is_uuid() -> None:
    result = derive_user_id("firebase-uid-abc")
    assert isinstance(result, uuid.UUID)
    assert result.version == 5


def test_derive_user_id_differs_per_uid() -> None:
    assert derive_user_id("uid-a") != derive_user_id("uid-b")


@pytest.mark.asyncio
async def test_invalid_token_returns_401(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=firebase_admin.auth.InvalidIdTokenError("bad token"),
        ):
            response = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer fake-token"},
            )
        assert response.status_code == 401
        assert response.json() == {
            "error": {"code": "unauthorized", "message": "Invalid or expired token"}
        }
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_valid_token_returns_user(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=None)
    mock_db.upsert = AsyncMock(return_value=str(uuid.uuid4()))

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
        assert response.json()["user"]["email"] == "test@example.com"
        mock_db.find_one.assert_awaited_once()
        mock_db.upsert.assert_awaited_once()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_missing_auth_header_returns_401(client: AsyncClient) -> None:
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
