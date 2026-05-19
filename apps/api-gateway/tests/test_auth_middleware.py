"""Unit tests for the Firebase auth middleware."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import firebase_admin.auth
import firebase_admin.exceptions
import pytest
from claimit_mongodb_models import MongoDBClient, SendMode, SubscriptionTier, User
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
async def test_transport_error_returns_503(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=firebase_admin.exceptions.UnavailableError("network error"),
        ):
            response = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer fake-token"},
            )
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "service_unavailable"
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
async def test_second_signin_returns_existing_user(client: AsyncClient) -> None:
    existing_user_id = derive_user_id("firebase-uid-existing")
    now = datetime.now(UTC)
    existing_user = User(
        id=existing_user_id,
        email="existing@example.com",
        name="Existing User",
        updated_at=now,
        default_location={"city": "", "state": "", "lat": 0.0, "lon": 0.0},
        loyalty_memberships=[],
        gmail_integration={
            "connected": False,
            "connected_at": None,
            "scopes_granted": [],
            "refresh_token_ref": None,
            "watch_history_id": None,
            "watch_expires_at": None,
            "last_processed_message_id": None,
        },
        send_preference={
            "default_mode": SendMode.APPROVAL,
            "auto_send_delay_seconds": 300,
            "changed_at": None,
        },
        ingestion_skiplist=[],
        notification_prefs={"web_push": True, "email": True},
        subscription={
            "tier": SubscriptionTier.TRIAL,
            "trial_ends": None,
            "renewed_at": None,
        },
        created_at=now,
    )

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=existing_user)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            return_value={
                "uid": "firebase-uid-existing",
                "email": "existing@example.com",
                "name": "Existing User",
            },
        ):
            response = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        assert response.json()["user"]["email"] == "existing@example.com"
        mock_db.find_one.assert_awaited_once()
        mock_db.upsert.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_new_user_created_with_onboarded_false(client: AsyncClient) -> None:
    """First-time Firebase signup → upserted User has onboarded=False.

    The Pydantic model defaults onboarded=True so legacy MongoDB documents
    without the field validate as already-onboarded; the new-user branch
    in _user_from_decoded_token has to override that default explicitly so
    fresh signups get routed through /onboarding by the frontend gate.
    """
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=None)
    mock_db.upsert = AsyncMock(return_value=str(uuid.uuid4()))

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            return_value={"uid": "new-uid", "email": "newcomer@example.com"},
        ):
            response = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        assert response.json()["user"]["onboarded"] is False

        mock_db.upsert.assert_awaited_once()
        upserted_user = mock_db.upsert.await_args.args[2]
        assert isinstance(upserted_user, User)
        assert upserted_user.onboarded is False
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_legacy_user_doc_without_onboarded_validates_as_true() -> None:
    """Existing MongoDB documents predate the onboarded field. Pydantic
    default=True backfills missing values at read time so claimitbeta and
    other beta accounts skip onboarding without a one-time migration."""
    legacy_doc: dict[str, object] = {
        "_id": "00000000-0000-0000-0000-000000000099",
        "updated_at": None,
        "email": "legacy@example.com",
        "name": "Legacy User",
        "default_location": {"city": "", "state": "", "lat": 0.0, "lon": 0.0},
        "loyalty_memberships": [],
        "gmail_integration": {
            "connected": False,
            "connected_at": None,
            "connected_email": None,
            "scopes_granted": [],
            "refresh_token_ref": None,
            "watch_history_id": None,
            "watch_expires_at": None,
            "last_processed_message_id": None,
        },
        "send_preference": {
            "default_mode": "approval",
            "auto_send_delay_seconds": 300,
            "changed_at": None,
        },
        "ingestion_skiplist": [],
        "notification_prefs": {"web_push": True, "email": True, "muted_event_types": []},
        "subscription": {"tier": "free", "trial_ends": None, "renewed_at": None},
        "created_at": "2024-01-01T00:00:00Z",
    }
    assert "onboarded" not in legacy_doc

    user = User.model_validate(legacy_doc)
    assert user.onboarded is True


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
