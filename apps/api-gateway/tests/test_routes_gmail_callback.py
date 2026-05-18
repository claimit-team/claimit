"""Tests for GET /api/v1/gmail/callback (public, OAuth redirect target)."""

from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from claimit_mongodb_models import MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db, get_secret_manager_client, get_state_jwt_key, get_token_cache
from src.main import app
from src.services import gmail_oauth, state_jwt
from src.services.token_cache import AccessTokenCache

from ._fixtures import USER_FIXTURE

_STATE_KEY = "test-state-jwt-key-for-callback-tests"
_USER_ID = "00000000-0000-0000-0000-000000000001"  # matches USER_FIXTURE["_id"]
_TEST_VERIFIER = "test-pkce-verifier-43chars-aaaaaaaaaaaaaaaaaaa"

_FAKE_ENV = {
    "GMAIL_OAUTH_CLIENT_ID": "test-client-id",
    "GMAIL_OAUTH_CLIENT_SECRET": "test-client-secret",
    "GMAIL_OAUTH_REDIRECT_URI": "https://api.example.com/api/v1/gmail/callback",
    "FRONTEND_BASE_URL": "https://app.example.com",
    "GCP_PROJECT_ID": "test-project",
}


def _override_deps(mock_db: AsyncMock, mock_sm_client: MagicMock | None = None) -> None:
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_secret_manager_client] = lambda: (
        mock_sm_client if mock_sm_client is not None else MagicMock()
    )
    app.dependency_overrides[get_state_jwt_key] = lambda: _STATE_KEY
    app.dependency_overrides[get_token_cache] = lambda: AccessTokenCache()


def _clear_overrides() -> None:
    for dep in (get_db, get_secret_manager_client, get_state_jwt_key, get_token_cache):
        app.dependency_overrides.pop(dep, None)


def _valid_state(return_to: str = "/settings/gmail") -> str:
    return state_jwt.sign_state(_USER_ID, return_to, _TEST_VERIFIER, _STATE_KEY, ttl_seconds=600)


def _fake_exchange_result() -> dict[str, object]:
    return {
        "refresh_token": "fake-refresh",
        "access_token": "fake-access",
        "expires_at": datetime.now(UTC) + timedelta(hours=1),
        "scopes": [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
        ],
        "connected_email": "user@gmail.com",
    }


@pytest.mark.asyncio
async def test_callback_happy_path_redirects_to_frontend_connected(client: AsyncClient) -> None:
    fixture = copy.deepcopy(USER_FIXTURE)
    user = User.model_validate(fixture)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.upsert = AsyncMock(return_value=_USER_ID)
    _override_deps(mock_db)
    try:
        with (
            patch.dict("os.environ", _FAKE_ENV),
            patch(
                "src.routes.gmail.gmail_oauth.exchange_code_for_tokens",
                return_value=_fake_exchange_result(),
            ) as mock_exchange,
            patch(
                "src.routes.gmail.secret_manager.store_refresh_token",
                return_value="projects/test-project/secrets/gmail-refresh-token-x/versions/1",
            ),
        ):
            response = await client.get(
                f"/api/v1/gmail/callback?code=auth-code&state={_valid_state()}",
                follow_redirects=False,
            )
        assert response.status_code == 302
        assert response.headers["location"] == (
            "https://app.example.com/settings/gmail?status=connected"
        )
        mock_db.upsert.assert_awaited_once()
        # Verifier from the state JWT must be threaded into the exchange so
        # Google's PKCE check passes. This is the regression that this fix
        # addresses.
        exchange_kwargs = mock_exchange.call_args.kwargs
        assert exchange_kwargs["code_verifier"] == _TEST_VERIFIER
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_callback_expired_state_redirects_with_error(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _override_deps(mock_db)
    try:
        with patch.dict("os.environ", _FAKE_ENV):
            expired = state_jwt.sign_state(
                _USER_ID,
                "/settings/gmail",
                _TEST_VERIFIER,
                _STATE_KEY,
                ttl_seconds=-1,
            )
            response = await client.get(
                f"/api/v1/gmail/callback?code=c&state={expired}",
                follow_redirects=False,
            )
        assert response.status_code == 302
        loc = urlparse(response.headers["location"])
        qs = parse_qs(loc.query)
        assert qs["status"] == ["error"]
        assert qs["reason"] == ["state_expired"]
        assert loc.path == "/settings/gmail"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_callback_invalid_signature_redirects_with_error(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _override_deps(mock_db)
    try:
        with patch.dict("os.environ", _FAKE_ENV):
            # State signed with a different key — verify_state -> InvalidState.
            forged = state_jwt.sign_state(
                _USER_ID,
                "/settings/gmail",
                _TEST_VERIFIER,
                "different-key-that-is-also-32-plus-bytes-long-for-pyjwt",
            )
            response = await client.get(
                f"/api/v1/gmail/callback?code=c&state={forged}",
                follow_redirects=False,
            )
        assert response.status_code == 302
        loc = urlparse(response.headers["location"])
        qs = parse_qs(loc.query)
        assert qs["status"] == ["error"]
        assert qs["reason"] == ["state_invalid"]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_callback_code_exchange_failure_redirects_with_error(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _override_deps(mock_db)
    try:
        with (
            patch.dict("os.environ", _FAKE_ENV),
            patch(
                "src.routes.gmail.gmail_oauth.exchange_code_for_tokens",
                side_effect=gmail_oauth.OAuthExchangeError("invalid_grant"),
            ),
        ):
            response = await client.get(
                f"/api/v1/gmail/callback?code=bad-code&state={_valid_state()}",
                follow_redirects=False,
            )
        assert response.status_code == 302
        loc = urlparse(response.headers["location"])
        qs = parse_qs(loc.query)
        assert qs["status"] == ["error"]
        assert qs["reason"] == ["code_exchange_failed"]
        assert loc.path == "/settings/gmail"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_callback_updates_user_gmail_integration_fields(client: AsyncClient) -> None:
    fixture = copy.deepcopy(USER_FIXTURE)
    user = User.model_validate(fixture)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.upsert = AsyncMock(return_value=_USER_ID)
    _override_deps(mock_db)
    secret_ref = "projects/test-project/secrets/gmail-refresh-token-x/versions/1"
    try:
        with (
            patch.dict("os.environ", _FAKE_ENV),
            patch(
                "src.routes.gmail.gmail_oauth.exchange_code_for_tokens",
                return_value=_fake_exchange_result(),
            ),
            patch(
                "src.routes.gmail.secret_manager.store_refresh_token",
                return_value=secret_ref,
            ),
        ):
            response = await client.get(
                f"/api/v1/gmail/callback?code=c&state={_valid_state()}",
                follow_redirects=False,
            )
        assert response.status_code == 302
        # Argument 3 to db.upsert is the mutated User; inspect it.
        upsert_call = mock_db.upsert.await_args
        assert upsert_call is not None
        _, _, updated_user = upsert_call.args
        g = updated_user.gmail_integration
        assert g.connected is True
        assert g.connected_email == "user@gmail.com"
        assert g.refresh_token_ref == secret_ref
        assert len(g.scopes_granted) == 2
    finally:
        _clear_overrides()
