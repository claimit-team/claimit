"""Tests for GET /api/v1/auth/me and PATCH /api/v1/auth/me."""

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


# ---------------------------------------------------------------------------
# PATCH /auth/me
# ---------------------------------------------------------------------------


def _patch_db(user: User | None = None) -> AsyncMock:
    """DB mock for PATCH /auth/me happy paths."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=user or User.model_validate(USER_FIXTURE))
    db.partial_update = AsyncMock(return_value=True)
    return db


@pytest.mark.asyncio
async def test_patch_me_updates_name_returns_updated_user(client: AsyncClient) -> None:
    """Happy path: partial_update is called with {name: ...} and the response
    user envelope reflects the post-update name."""
    db = _patch_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"name": "New Name"},
            )
        assert response.status_code == 200
        assert response.json()["user"]["name"] == "New Name"
        # refresh_token_ref must never leak.
        assert "refresh_token_ref" not in response.json()["user"]["gmail_integration"]

        db.partial_update.assert_called_once()
        updates = db.partial_update.call_args.args[2]
        assert updates == {"name": "New Name"}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_empty_body_is_noop_returns_current_user(client: AsyncClient) -> None:
    """Empty body / all-null fields skip the Mongo write entirely."""
    db = _patch_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={},
            )
        assert response.status_code == 200
        assert response.json()["user"]["name"] == USER_FIXTURE["name"]
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_name_too_long_returns_422(client: AsyncClient) -> None:
    """Pydantic Field(max_length=100) rejects oversized names before any DB write."""
    db = _patch_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"name": "x" * 101},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_name_empty_string_returns_422(client: AsyncClient) -> None:
    """Empty-string name violates min_length=1 — empty isn't a valid name."""
    db = _patch_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"name": ""},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_invalid_ingestion_skiplist_entry_returns_422(client: AsyncClient) -> None:
    """IngestionSkiplistEntry requires sender/format_hash/added_at/reason —
    a malformed entry is rejected at request validation, no DB write."""
    db = _patch_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"ingestion_skiplist": [{"sender": "noreply@example.com"}]},  # missing fields
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_does_not_allow_email_update(client: AsyncClient) -> None:
    """Email lives in Firebase, not the patch surface. Pydantic's default
    extra='ignore' silently drops the field, so the request succeeds (with
    the email patch ignored) and partial_update is called with no `email` key."""
    db = _patch_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"name": "Renamed", "email": "attacker@evil.example"},
            )
        assert response.status_code == 200
        assert response.json()["user"]["email"] == USER_FIXTURE["email"]

        db.partial_update.assert_called_once()
        updates = db.partial_update.call_args.args[2]
        assert "email" not in updates
        assert updates == {"name": "Renamed"}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_requires_bearer(client: AsyncClient) -> None:
    """No Authorization header → 401, no DB write."""
    db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.patch("/api/v1/auth/me", json={"name": "Anon"})
        assert response.status_code == 401
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_can_set_onboarded_true(client: AsyncClient) -> None:
    """PATCH {onboarded: true} flips the User.onboarded flag and the response
    envelope reflects the post-update state. Used by the onboarding flow's
    final step (Step 3 preferences page) to mark setup complete before
    redirecting to /dashboard."""
    fixture = copy.deepcopy(USER_FIXTURE)
    fixture["onboarded"] = False
    db = _patch_db(User.model_validate(fixture))

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"onboarded": True},
            )
        assert response.status_code == 200
        assert response.json()["user"]["onboarded"] is True

        db.partial_update.assert_called_once()
        updates = db.partial_update.call_args.args[2]
        assert updates == {"onboarded": True}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_can_set_onboarded_false(client: AsyncClient) -> None:
    """Symmetric to set-true — false is also a valid value. Not used by the
    UI today but allows admin-reset / future flows to push the user back
    through onboarding without backdoor MongoDB writes."""
    db = _patch_db()  # default fixture has onboarded missing → Pydantic default True

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"onboarded": False},
            )
        assert response.status_code == 200
        assert response.json()["user"]["onboarded"] is False

        db.partial_update.assert_called_once()
        updates = db.partial_update.call_args.args[2]
        assert updates == {"onboarded": False}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_me_returns_404_when_user_missing(client: AsyncClient) -> None:
    """If partial_update reports no document matched (user deleted between
    auth + write), the route raises ApiError(user_not_found, 404)."""
    db = _patch_db()
    db.partial_update = AsyncMock(return_value=False)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"name": "Renamed"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "user_not_found"
    finally:
        app.dependency_overrides.pop(get_db, None)
