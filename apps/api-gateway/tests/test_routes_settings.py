"""Tests for PUT /api/v1/settings/send-preference and /settings/notifications.

These endpoints fully replace User.send_preference / User.notification_prefs
respectively (see routes/settings.py for the rationale — partial_update only
validates top-level User fields, so each sub-document is replaced wholesale).

Test plan:
- send-preference: 7 tests (happy + 4 validation + 401 + server-stamps changed_at)
- notifications: 5 tests (happy + empty mute list + 1 validation + 401 + missing field)
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from claimit_mongodb_models import MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db
from src.main import app

from ._fixtures import USER_FIXTURE

_USER = User.model_validate(USER_FIXTURE)
_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}


def _mock_db() -> AsyncMock:
    """DB mock wired for the settings endpoints: find_one returns the user,
    partial_update returns True (one document matched)."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=_USER)
    db.partial_update = AsyncMock(return_value=True)
    return db


# ---------------------------------------------------------------------------
# PUT /settings/send-preference
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_preference_happy_path_returns_200_with_user_envelope(
    client: AsyncClient,
) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/send-preference",
                headers={"Authorization": "Bearer valid-token"},
                json={"default_mode": "auto", "auto_send_delay_seconds": 600},
            )
        assert response.status_code == 200
        payload = response.json()
        assert "user" in payload
        # Sensitive Secret Manager ref must not be exposed.
        assert "refresh_token_ref" not in payload["user"]["gmail_integration"]
        # Response reflects the post-update state.
        assert payload["user"]["send_preference"]["default_mode"] == "auto"
        assert payload["user"]["send_preference"]["auto_send_delay_seconds"] == 600
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_send_preference_persists_via_partial_update_with_server_changed_at(
    client: AsyncClient,
) -> None:
    """partial_update must be called with the full SendPreference sub-document
    and a server-stamped changed_at within the request window."""
    db = _mock_db()
    before = datetime.now(UTC)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/send-preference",
                headers={"Authorization": "Bearer valid-token"},
                json={"default_mode": "auto", "auto_send_delay_seconds": 30},
            )
        after = datetime.now(UTC)

        assert response.status_code == 200
        db.partial_update.assert_called_once()
        kwargs_or_args = db.partial_update.call_args
        # signature: (collection, id, updates, model=...)
        assert kwargs_or_args.args[0] == "users"
        assert kwargs_or_args.args[1] == _USER.id
        updates = kwargs_or_args.args[2]
        assert set(updates) == {"send_preference"}
        sp = updates["send_preference"]
        assert sp["default_mode"] == "auto"
        assert sp["auto_send_delay_seconds"] == 30
        # changed_at is ISO-8601 string after model_dump(mode unspecified -> python).
        # model_dump() without mode returns datetime objects; verify range.
        changed_at = sp["changed_at"]
        assert isinstance(changed_at, datetime)
        assert before <= changed_at <= after
        assert kwargs_or_args.kwargs.get("model") is User
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_send_preference_rejects_invalid_default_mode(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/send-preference",
                headers={"Authorization": "Bearer valid-token"},
                json={"default_mode": "INVALID", "auto_send_delay_seconds": 60},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_send_preference_rejects_negative_delay(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/send-preference",
                headers={"Authorization": "Bearer valid-token"},
                json={"default_mode": "auto", "auto_send_delay_seconds": -1},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_send_preference_rejects_delay_over_one_day(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/send-preference",
                headers={"Authorization": "Bearer valid-token"},
                json={"default_mode": "auto", "auto_send_delay_seconds": 86_401},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_send_preference_requires_bearer(client: AsyncClient) -> None:
    """No Authorization header → 401. get_db override needed because FastAPI
    resolves all dependencies eagerly (lifespan never runs under ASGITransport)."""
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.put(
            "/api/v1/settings/send-preference",
            json={"default_mode": "auto", "auto_send_delay_seconds": 60},
        )
        assert response.status_code == 401
        mock_db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_send_preference_rejects_missing_default_mode(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/send-preference",
                headers={"Authorization": "Bearer valid-token"},
                json={"auto_send_delay_seconds": 60},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_send_preference_returns_404_when_user_missing(
    client: AsyncClient,
) -> None:
    """If partial_update reports no match (user deleted between auth + write),
    the route raises ApiError(user_not_found, 404). Both settings endpoints
    use the same code path so one test covers both."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_args, **_kwargs: User.model_validate(USER_FIXTURE))
    db.partial_update = AsyncMock(return_value=False)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/send-preference",
                headers={"Authorization": "Bearer valid-token"},
                json={"default_mode": "auto", "auto_send_delay_seconds": 600},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "user_not_found"
    finally:
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# PUT /settings/notifications
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_notifications_happy_path_persists_mute_list(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/notifications",
                headers={"Authorization": "Bearer valid-token"},
                json={
                    "web_push": False,
                    "email": True,
                    "muted_event_types": ["claim_denied", "price_dropped"],
                },
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["user"]["notification_prefs"]["web_push"] is False
        assert payload["user"]["notification_prefs"]["email"] is True
        assert payload["user"]["notification_prefs"]["muted_event_types"] == [
            "claim_denied",
            "price_dropped",
        ]

        db.partial_update.assert_called_once()
        updates = db.partial_update.call_args.args[2]
        assert set(updates) == {"notification_prefs"}
        np = updates["notification_prefs"]
        assert np["web_push"] is False
        assert np["email"] is True
        assert np["muted_event_types"] == ["claim_denied", "price_dropped"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_notifications_accepts_empty_mute_list(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/notifications",
                headers={"Authorization": "Bearer valid-token"},
                json={"web_push": True, "email": False, "muted_event_types": []},
            )
        assert response.status_code == 200
        assert response.json()["user"]["notification_prefs"]["muted_event_types"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_notifications_rejects_unknown_event_type(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/notifications",
                headers={"Authorization": "Bearer valid-token"},
                json={
                    "web_push": True,
                    "email": True,
                    "muted_event_types": ["definitely_not_a_real_event"],
                },
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_notifications_requires_bearer(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.put(
            "/api/v1/settings/notifications",
            json={"web_push": True, "email": True, "muted_event_types": []},
        )
        assert response.status_code == 401
        mock_db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_notifications_rejects_missing_muted_event_types(client: AsyncClient) -> None:
    """muted_event_types has no default on the request model — PUT is a full
    replacement, so callers must explicitly state the mute set (even if empty)."""
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                "/api/v1/settings/notifications",
                headers={"Authorization": "Bearer valid-token"},
                json={"web_push": True, "email": True},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)
