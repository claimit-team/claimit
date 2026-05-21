"""Tests for `claimit_gmail.watch` (moved from apps/api-gateway/tests/test_gmail_watch.py
when 4.16 extracted the package).

Covers both public entry points:

- `register_watch_or_raise`: raises on every terminal failure mode
  (Gmail 4xx, exhausted 5xx, missing refresh token, missing user, etc.).
  These tests pin the contract that the 4.16 renewal sweep depends on —
  it counts per-user outcomes by catching exceptions, so silent-failure
  regressions would break the sweep's counters without breaking any
  test if we only tested `_safe`.

- `register_watch_safe`: catches everything, persists `watch_failed=True`
  to the user doc, never raises. These tests pin the contract the
  api-gateway OAuth-callback BackgroundTask depends on (no error channel).

All Gmail / Secret Manager / google-auth integration points are mocked
so the suite runs with no GCP credentials and no network access.
"""

from __future__ import annotations

import copy
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from claimit_gmail import WatchRegistrationError
from claimit_gmail import watch as gmail_watch
from claimit_mongodb_models import MongoDBClient, User

_USER_ID = "00000000-0000-0000-0000-000000000001"

_FAKE_ENV = {
    "GMAIL_OAUTH_CLIENT_ID": "test-client-id",
    "GMAIL_OAUTH_CLIENT_SECRET": "test-client-secret",
    "GMAIL_INBOUND_TOPIC": "projects/test-project/topics/gmail-inbound",
}

# Minimal in-test User fixture. Not imported from api-gateway's
# `_fixtures.py` because that file lives inside the api-gateway tests
# tree — pulling it in here would create a reverse dep from a shared
# package into a consumer. Inlining is small (one builder) and keeps
# the shared package self-contained.
_BASE_USER_FIXTURE: dict[str, object] = {
    "_id": _USER_ID,
    "updated_at": None,
    "email": "test@example.com",
    "name": "Test User",
    "default_location": {
        "city": "San Francisco",
        "state": "CA",
        "lat": 37.7749,
        "lon": -122.4194,
    },
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


def _connected_user_dict() -> dict[str, object]:
    fixture = copy.deepcopy(_BASE_USER_FIXTURE)
    gi = fixture["gmail_integration"]
    assert isinstance(gi, dict)
    gi["connected"] = True
    gi["connected_email"] = "user@gmail.com"
    gi["scopes_granted"] = ["https://www.googleapis.com/auth/gmail.readonly"]
    gi["refresh_token_ref"] = (
        f"projects/test-project/secrets/gmail-refresh-token-{_USER_ID}/versions/latest"
    )
    return fixture


def _mock_sm_client() -> MagicMock:
    sm = MagicMock()
    response = MagicMock()
    response.payload.data = b"fake-refresh-token"
    sm.access_secret_version.return_value = response
    return sm


def _mock_creds_refresh(token: str = "fake-access-token"):
    """Patch google.oauth2.credentials.Credentials.refresh to set .token.

    The function `register_watch_or_raise` calls `creds.refresh(...)` via
    `run_in_threadpool`; this autospec patch makes that synchronous call
    populate `creds.token` so the access-token branch proceeds.
    """

    def _refresh(self, request):
        self.token = token

    return patch.object(gmail_watch.Credentials, "refresh", autospec=True, side_effect=_refresh)


# ---------------------------------------------------------------------------
# register_watch_or_raise — raises on every terminal failure mode
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_or_raise_happy_path_persists_history_and_expires() -> None:
    """Success path: returns None, persists historyId + expires_at + clears
    any stale watch_failed flag on the user doc."""
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.partial_update = AsyncMock(return_value=1)

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {"historyId": "12345", "expiration": "1779316800000"}

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        _mock_creds_refresh(),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        await gmail_watch.register_watch_or_raise(_USER_ID, mock_db, _mock_sm_client())

    # Gmail API call shape
    call_args = mock_client.post.await_args
    assert call_args.args[0] == "https://gmail.googleapis.com/gmail/v1/users/me/watch"
    body = call_args.kwargs["json"]
    assert body["topicName"] == "projects/test-project/topics/gmail-inbound"
    assert body["labelIds"] == ["INBOX"]
    assert call_args.kwargs["headers"]["Authorization"] == "Bearer fake-access-token"

    # Persisted state
    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_history_id"] == "12345"
    assert "gmail_integration.watch_expires_at" in update
    assert update["gmail_integration.watch_failed"] is False
    assert update["gmail_integration.watch_error_message"] is None


@pytest.mark.asyncio
async def test_or_raise_4xx_raises_watch_registration_error() -> None:
    """A 4xx from Gmail is terminal — `_or_raise` must propagate so the
    renewal sweep can count it as `failed`."""
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

        with pytest.raises(WatchRegistrationError) as exc:
            await gmail_watch.register_watch_or_raise(_USER_ID, mock_db, _mock_sm_client())

    # Only one Gmail call (4xx is terminal, no retry).
    assert mock_client.post.await_count == 1
    assert "Insufficient permission" in exc.value.terminal_message
    # _or_raise does NOT persist on failure — that's _safe's job.
    mock_db.partial_update.assert_not_called()


@pytest.mark.asyncio
async def test_or_raise_5xx_retries_then_raises() -> None:
    """Three 5xx responses → `_or_raise` exhausts retries and raises."""
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

        with pytest.raises(WatchRegistrationError):
            await gmail_watch.register_watch_or_raise(_USER_ID, mock_db, _mock_sm_client())

    assert mock_client.post.await_count == gmail_watch._MAX_ATTEMPTS
    mock_db.partial_update.assert_not_called()


@pytest.mark.asyncio
async def test_or_raise_no_refresh_token_raises_without_calling_gmail() -> None:
    """User exists but has no refresh_token_ref → terminal pre-flight.
    Should not even hit Gmail's API."""
    fixture = copy.deepcopy(_BASE_USER_FIXTURE)
    gi = fixture["gmail_integration"]
    assert isinstance(gi, dict)
    gi["connected"] = True
    gi["refresh_token_ref"] = None
    user = User.model_validate(fixture)

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.partial_update = AsyncMock(return_value=1)

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        with pytest.raises(WatchRegistrationError) as exc:
            await gmail_watch.register_watch_or_raise(_USER_ID, mock_db, _mock_sm_client())
        mock_client_cls.assert_not_called()

    assert "not connected" in exc.value.terminal_message.lower()
    mock_db.partial_update.assert_not_called()


@pytest.mark.asyncio
async def test_or_raise_missing_user_raises() -> None:
    """User_id resolves to nothing in Mongo — terminal."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=None)
    mock_db.partial_update = AsyncMock(return_value=1)

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        pytest.raises(WatchRegistrationError) as exc,
    ):
        await gmail_watch.register_watch_or_raise(_USER_ID, mock_db, _mock_sm_client())

    assert "user not found" in exc.value.terminal_message.lower()
    mock_db.partial_update.assert_not_called()


# ---------------------------------------------------------------------------
# register_watch_safe — never raises, persists watch_failed on every error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_safe_happy_path_returns_without_persisting_failure() -> None:
    """Success path through `_safe`: delegates to `_or_raise`, no failure
    state persisted — the success persist happens inside `_or_raise`."""
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    mock_db.partial_update = AsyncMock(return_value=1)

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {"historyId": "555", "expiration": "1779316800000"}

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        _mock_creds_refresh(),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        await gmail_watch.register_watch_safe(_USER_ID, mock_db, _mock_sm_client())

    # Exactly one partial_update — the success path's.
    assert mock_db.partial_update.await_count == 1
    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_failed"] is False


@pytest.mark.asyncio
async def test_safe_swallows_watch_registration_error_and_persists() -> None:
    """A 4xx propagates from `_or_raise` → `_safe` catches it, persists
    watch_failed=True with the terminal_message, returns None."""
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

        # Must NOT raise.
        await gmail_watch.register_watch_safe(_USER_ID, mock_db, _mock_sm_client())

    update = mock_db.partial_update.await_args.args[2]
    assert update["gmail_integration.watch_failed"] is True
    assert "Insufficient permission" in update["gmail_integration.watch_error_message"]


@pytest.mark.asyncio
async def test_safe_swallows_unexpected_exception_and_persists_generic_message() -> None:
    """An unexpected exception (e.g. a Mongo blip during _persist_success
    on the success path) is also caught by `_safe`, persisted with a
    generic `Internal error registering watch: <type>` message, and
    swallowed. The exception type appears in the persisted message for
    log triage but the user-facing surface stays generic."""
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    # First partial_update (success persist) raises something unexpected;
    # second partial_update (failure persist, via _safe's except block)
    # succeeds. Use a side_effect list to drive the two calls.
    mock_db.partial_update = AsyncMock(side_effect=[RuntimeError("mongo blip"), 1])

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {"historyId": "5", "expiration": "1779316800000"}

    with (
        patch.dict("os.environ", _FAKE_ENV, clear=False),
        _mock_creds_refresh(),
        patch.object(gmail_watch.httpx, "AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=fake_response)
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        # Must not raise.
        await gmail_watch.register_watch_safe(_USER_ID, mock_db, _mock_sm_client())

    assert mock_db.partial_update.await_count == 2
    failure_update = mock_db.partial_update.await_args_list[1].args[2]
    assert failure_update["gmail_integration.watch_failed"] is True
    assert "RuntimeError" in failure_update["gmail_integration.watch_error_message"]


@pytest.mark.asyncio
async def test_safe_swallows_persist_failure_db_error() -> None:
    """If even the failure-persist call itself raises (Mongo really down),
    `_safe` still returns None instead of leaking the second exception."""
    user = User.model_validate(_connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    # Every partial_update call raises. The failure-persist path inside
    # `_safe` has its own try/except specifically for this case.
    mock_db.partial_update = AsyncMock(side_effect=RuntimeError("mongo really down"))

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

        # Must not raise.
        await gmail_watch.register_watch_safe(_USER_ID, mock_db, _mock_sm_client())
