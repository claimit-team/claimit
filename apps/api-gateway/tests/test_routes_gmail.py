"""Tests for /api/v1/gmail/status and /api/v1/gmail/disconnect."""

from __future__ import annotations

import copy
from unittest.mock import AsyncMock, patch

import pytest
from claimit_mongodb_models import MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db
from src.main import app

from ._fixtures import USER_FIXTURE

_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}


def _connected_user_fixture() -> dict[str, object]:
    """Deep-copy of USER_FIXTURE pre-populated with a fully-connected gmail_integration."""
    fixture = copy.deepcopy(USER_FIXTURE)
    fixture["gmail_integration"] = {
        "connected": True,
        "connected_at": "2024-06-01T12:00:00Z",
        "connected_email": "user@gmail.com",
        "scopes_granted": [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
        ],
        "refresh_token_ref": "projects/p/secrets/gmail-refresh-token-abc/versions/1",
        "watch_history_id": "12345",
        "watch_expires_at": "2024-07-01T12:00:00Z",
        "last_processed_message_id": "msg-99",
    }
    return fixture


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
        assert payload == {
            "connected": False,
            "email": None,
            "scopes": [],
            "watch_failed": False,
            "watch_error_message": None,
        }
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
        assert set(payload["scopes"]) == {
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
        }
        # Ticket 4.15: a freshly-connected user with no watch-registration
        # attempt yet should report both fields at their default state.
        assert payload["watch_failed"] is False
        assert payload["watch_error_message"] is None
    finally:
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# POST /gmail/disconnect
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_disconnect_returns_200_and_clears_all_gmail_fields(client: AsyncClient) -> None:
    """Happy path: a connected user's gmail_integration is fully reset and the
    response envelope mirrors /auth/me (refresh_token_ref stripped)."""
    user = User.model_validate(_connected_user_fixture())
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=user)
    db.partial_update = AsyncMock(return_value=True)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/gmail/disconnect",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        gi = payload["user"]["gmail_integration"]
        assert gi["connected"] is False
        assert gi["connected_at"] is None
        assert gi["connected_email"] is None
        assert gi["scopes_granted"] == []
        assert gi["watch_history_id"] is None
        assert gi["watch_expires_at"] is None
        assert gi["last_processed_message_id"] is None
        # refresh_token_ref must never leak in the response, even pre/post disconnect.
        assert "refresh_token_ref" not in gi
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_disconnect_response_user_has_connected_false_and_email_null(
    client: AsyncClient,
) -> None:
    """Frontend swaps useAuthStore.user from this response — verify the two
    fields the /settings/gmail page binds against (`connected`, `connected_email`)."""
    user = User.model_validate(_connected_user_fixture())
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=user)
    db.partial_update = AsyncMock(return_value=True)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/gmail/disconnect",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        gi = response.json()["user"]["gmail_integration"]
        assert gi["connected"] is False
        assert gi["connected_email"] is None
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_disconnect_calls_partial_update_with_cleared_gmail_integration(
    client: AsyncClient,
) -> None:
    """Verify the persistence call: a single partial_update of the entire
    gmail_integration sub-document with every field zeroed/null."""
    user = User.model_validate(_connected_user_fixture())
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=user)
    db.partial_update = AsyncMock(return_value=True)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/gmail/disconnect",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200

        db.partial_update.assert_called_once()
        call = db.partial_update.call_args
        # signature: (collection, id, updates, model=...)
        assert call.args[0] == "users"
        assert call.args[1] == user.id
        updates = call.args[2]
        assert set(updates) == {"gmail_integration"}
        gi = updates["gmail_integration"]
        assert gi == {
            "connected": False,
            "connected_at": None,
            "connected_email": None,
            "scopes_granted": [],
            "refresh_token_ref": None,
            "watch_history_id": None,
            "watch_expires_at": None,
            "last_processed_message_id": None,
            "watch_failed": False,
            "watch_error_message": None,
            "last_processed_history_id": None,
        }
        assert call.kwargs.get("model") is User
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_disconnect_idempotent_when_already_disconnected(client: AsyncClient) -> None:
    """Disconnecting an already-disconnected user is a 200 no-op (DB write
    still runs because we always replace the sub-document — by design, this
    keeps the handler branchless and lets the frontend retry safely)."""
    user = User.model_validate(USER_FIXTURE)  # fixture default = disconnected
    assert user.gmail_integration.connected is False  # sanity

    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=user)
    db.partial_update = AsyncMock(return_value=True)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/gmail/disconnect",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        gi = response.json()["user"]["gmail_integration"]
        assert gi["connected"] is False
        assert gi["connected_email"] is None
        # Persistence still runs (idempotent overwrite).
        db.partial_update.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_disconnect_requires_bearer(client: AsyncClient) -> None:
    """No Authorization header → 401, no DB write."""
    db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.post("/api/v1/gmail/disconnect")
        assert response.status_code == 401
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)
