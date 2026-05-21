"""Tests for src/services/gmail_watch.py (ticket 4.15).

Covers the BackgroundTask invoked after a successful OAuth callback:
- happy path: Gmail returns 200 → user doc records watch_history_id + expires_at
- 4xx (e.g. revoked grant) → watch_failed=True + error message persisted
- 5xx → retries up to _MAX_ATTEMPTS, then marks watch_failed=True
- missing refresh_token_ref → terminal failure, no Gmail call
- DB partial_update failure on persist_failure → swallowed, never raises
"""

from __future__ import annotations

import copy
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from claimit_mongodb_models import MongoDBClient, User
from src.services import gmail_watch

from ._fixtures import USER_FIXTURE

_USER_ID = "00000000-0000-0000-0000-000000000001"

_FAKE_ENV = {
    "GMAIL_OAUTH_CLIENT_ID": "test-client-id",
    "GMAIL_OAUTH_CLIENT_SECRET": "test-client-secret",
    "GMAIL_INBOUND_TOPIC": "projects/test-project/topics/gmail-inbound",
}


def _connected_user_dict() -> dict[str, object]:
    fixture = copy.deepcopy(USER_FIXTURE)
    gi = fixture["gmail_integration"]
    assert isinstance(gi, dict)
    gi["connected"] = True
    gi["connected_email"] = "user@gmail.com"
    gi["scopes_granted"] = ["https://www.googleapis.com/auth/gmail.readonly"]
    gi["refresh_token_ref"] = (
        "projects/test-project/secrets/gmail-refresh-token-"
        "00000000-0000-0000-0000-000000000001/versions/latest"
    )
    return fixture


def _mock_sm_client() -> MagicMock:
    sm = MagicMock()
    response = MagicMock()
    response.payload.data = b"fake-refresh-token"
    sm.access_secret_version.return_value = response
    return sm


def _mock_creds_refresh(token: str = "fake-access-token"):
    """Patch google.oauth2.credentials.Credentials.refresh to set .token."""

    def _refresh(self, request):
        self.token = token

    return patch.object(gmail_watch.Credentials, "refresh", autospec=True, side_effect=_refresh)


@pytest.mark.asyncio
async def test_register_watch_happy_path_persists_history_and_expires() -> None:
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.partial_update = AsyncMock(return_value=1)

    fake_response = MagicMock()
    fake_response.status_code = 200
    # Expiration 7 days out (2026-05-28 in ms epoch — value not checked beyond parseability).
    fake_response.json.return_value = {"historyId": "12345", "expiration": "1779316800000"}

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        _mock_creds_refresh(),
        patch.object(
            gmail_watch.httpx,
            "AsyncClient",
        ) as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        await gmail_watch.register_watch(_USER_ID, mock_db, _mock_sm_client())

    # Verify the Gmail call used the right topic + scopes.
    call_args = mock_client.post.await_args
    assert call_args.args[0] == "https://gmail.googleapis.com/gmail/v1/users/me/watch"
    body = call_args.kwargs["json"]
    assert body["topicName"] == "projects/test-project/topics/gmail-inbound"
    assert body["labelIds"] == ["INBOX"]
    assert call_args.kwargs["headers"]["Authorization"] == "Bearer fake-access-token"

    # Verify the user doc was updated with success state.
    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_history_id"] == "12345"
    assert "gmail_integration.watch_expires_at" in update
    assert update["gmail_integration.watch_failed"] is False
    assert update["gmail_integration.watch_error_message"] is None


@pytest.mark.asyncio
async def test_register_watch_4xx_marks_watch_failed() -> None:
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.partial_update = AsyncMock(return_value=1)

    fake_response = MagicMock()
    fake_response.status_code = 403
    fake_response.json.return_value = {"error": {"message": "Insufficient permission"}}
    fake_response.text = '{"error": {"message": "Insufficient permission"}}'

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        _mock_creds_refresh(),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        await gmail_watch.register_watch(_USER_ID, mock_db, _mock_sm_client())

    # 4xx is terminal — only one Gmail call.
    assert mock_client.post.await_count == 1
    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_failed"] is True
    assert "Insufficient permission" in update["gmail_integration.watch_error_message"]


@pytest.mark.asyncio
async def test_register_watch_5xx_retries_then_marks_failed() -> None:
    """Three 5xx responses → terminal failure after _MAX_ATTEMPTS attempts."""
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.partial_update = AsyncMock(return_value=1)

    fake_response = MagicMock()
    fake_response.status_code = 503
    fake_response.json.return_value = {"error": {"message": "backend unavailable"}}
    fake_response.text = "backend unavailable"

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        _mock_creds_refresh(),
        # _sleep_backoff would otherwise inject 1-7s of sleep per retry.
        patch.object(gmail_watch, "_sleep_backoff", new=AsyncMock(return_value=None)),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        await gmail_watch.register_watch(_USER_ID, mock_db, _mock_sm_client())

    assert mock_client.post.await_count == gmail_watch._MAX_ATTEMPTS
    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_failed"] is True


@pytest.mark.asyncio
async def test_register_watch_no_refresh_token_marks_failed_without_calling_gmail() -> None:
    fixture = copy.deepcopy(USER_FIXTURE)
    gi = fixture["gmail_integration"]
    assert isinstance(gi, dict)
    gi["connected"] = True
    gi["refresh_token_ref"] = None  # ← gate
    user = User.model_validate(fixture)

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.partial_update = AsyncMock(return_value=1)

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        await gmail_watch.register_watch(_USER_ID, mock_db, _mock_sm_client())
        mock_client_cls.assert_not_called()

    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_failed"] is True
    assert "not connected" in update["gmail_integration.watch_error_message"].lower()


@pytest.mark.asyncio
async def test_register_watch_swallows_persist_failure_db_error() -> None:
    """Mongo blip during _persist_failure must not propagate — caller is a
    FastAPI BackgroundTask with no way to react to a raise."""
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    # First partial_update (success path) would never be reached; the
    # 4xx path takes us into _persist_failure where partial_update raises.
    mock_db.partial_update = AsyncMock(side_effect=RuntimeError("mongo down"))

    fake_response = MagicMock()
    fake_response.status_code = 400
    fake_response.json.return_value = {"error": {"message": "bad request"}}
    fake_response.text = "bad request"

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        _mock_creds_refresh(),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        # Should not raise.
        await gmail_watch.register_watch(_USER_ID, mock_db, _mock_sm_client())


@pytest.mark.asyncio
async def test_register_watch_missing_user_marks_failed() -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=None)
    mock_db.partial_update = AsyncMock(return_value=1)

    with patch.dict("os.environ", _FAKE_ENV, clear=False):
        await gmail_watch.register_watch(_USER_ID, mock_db, _mock_sm_client())

    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_failed"] is True
    assert "user not found" in update["gmail_integration.watch_error_message"].lower()
