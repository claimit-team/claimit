"""Tests for `claimit_gmail.send` (ticket 4.18).

Covers the public `gmail_send` entry point and the typed-exception
contract the auto-send cron worker in claim-agent depends on. All
external integration points are mocked:

- httpx.AsyncClient.post → returns canned Gmail Send responses
- exchange_refresh_for_access → returns a fake access token
- Secret Manager + Mongo → AsyncMock / MagicMock

The suite runs without GCP credentials, without network access, and
without a Mongo instance — matching the existing test_watch.py
pattern in this package so the package's test boundary stays uniform.
"""

from __future__ import annotations

import base64
import copy
from email import message_from_bytes
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from claimit_gmail import (
    GmailQuotaExceededError,
    GmailSendError,
    GmailTokenRevokedError,
    gmail_send,
)
from claimit_gmail import send as gmail_send_mod
from claimit_mongodb_models import MongoDBClient, User

_USER_ID = "00000000-0000-0000-0000-000000000001"

# Same fixture shape as test_watch.py — inlined so test files don't
# share private builders. Updated by `_connected_user_dict` to flip
# the Gmail-connected fields for the success-path tests.
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
    gi["scopes_granted"] = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ]
    gi["refresh_token_ref"] = (
        f"projects/test-project/secrets/gmail-refresh-token-{_USER_ID}/versions/latest"
    )
    return fixture


def _mock_db_with_user(user_dict: dict[str, object] | None = None) -> AsyncMock:
    user = User.model_validate(user_dict or _connected_user_dict())
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=user)
    return mock_db


def _patch_exchange_refresh(access_token: str = "fake-access-token"):
    """Patch the OAuth refresh call so tests don't need real creds.

    `exchange_refresh_for_access` is in claimit_gmail.watch; gmail_send
    imports it from there. We patch the symbol AS IMPORTED into the
    send module so the patch covers the actual call site."""
    return patch.object(
        gmail_send_mod,
        "exchange_refresh_for_access",
        new=AsyncMock(return_value=access_token),
    )


def _make_response(status_code: int, json_body: dict | None = None, text: str = "") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    if json_body is not None:
        resp.json.return_value = json_body
    else:
        resp.json.side_effect = ValueError("no json body")
    resp.text = text or (str(json_body) if json_body else "")
    return resp


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_happy_path_returns_message_id_and_sent_at() -> None:
    """Success: Gmail returns 200 with {id, threadId}; gmail_send
    returns a GmailSendResult carrying both plus a UTC sent_at."""
    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(200, {"id": "msg-abc", "threadId": "thr-1"}))

    with _patch_exchange_refresh():
        result = await gmail_send(
            user_id=_USER_ID,
            to="claims@hilton.com",
            subject="Price protection request",
            body="Plain body.",
            db=db,
            sm_client=sm,
            http_client=http,
        )

    assert result.message_id == "msg-abc"
    assert result.thread_id == "thr-1"
    assert result.sent_at.tzinfo is not None  # UTC-aware

    # Exactly one POST to the Gmail Send endpoint.
    http.post.assert_awaited_once()
    args, kwargs = http.post.call_args
    assert args[0] == gmail_send_mod.GMAIL_SEND_URL
    assert kwargs["headers"]["Authorization"] == "Bearer fake-access-token"
    raw_b64 = kwargs["json"]["raw"]
    # Round-trip the MIME so assertions are content-based, not regex.
    mime_bytes = base64.urlsafe_b64decode(raw_b64)
    msg = message_from_bytes(mime_bytes)
    assert msg["To"] == "claims@hilton.com"
    assert msg["From"] == "user@gmail.com"  # from gmail_integration.connected_email
    assert msg["Subject"] == "Price protection request"
    # MIMEText with utf-8 default-encodes the body (typically base64) for
    # transport. Decode through the Message API rather than asserting
    # against the raw payload — the encoding is an implementation detail
    # of the stdlib email package and may change.
    body_bytes = msg.get_payload(decode=True)
    assert body_bytes is not None
    assert "Plain body." in body_bytes.decode("utf-8")


@pytest.mark.asyncio
async def test_send_bcc_included_in_mime_headers() -> None:
    """When bcc is set, the Bcc header lands in the raw MIME message.
    Gmail Send respects Bcc in the raw payload (the standard mechanism
    for BCC over the Send API)."""
    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(200, {"id": "msg-1", "threadId": "t-1"}))

    with _patch_exchange_refresh():
        await gmail_send(
            user_id=_USER_ID,
            to="claims@hilton.com",
            subject="S",
            body="B",
            bcc="audit@claimit.team",
            db=db,
            sm_client=sm,
            http_client=http,
        )

    raw_b64 = http.post.call_args.kwargs["json"]["raw"]
    msg = message_from_bytes(base64.urlsafe_b64decode(raw_b64))
    assert msg["Bcc"] == "audit@claimit.team"


@pytest.mark.asyncio
async def test_send_omits_bcc_when_not_set() -> None:
    """When bcc is None, the Bcc header is absent (vs present-and-empty
    which can confuse some MTAs)."""
    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(200, {"id": "msg-1", "threadId": "t-1"}))

    with _patch_exchange_refresh():
        await gmail_send(
            user_id=_USER_ID,
            to="claims@hilton.com",
            subject="S",
            body="B",
            bcc=None,
            db=db,
            sm_client=sm,
            http_client=http,
        )

    raw_b64 = http.post.call_args.kwargs["json"]["raw"]
    msg = message_from_bytes(base64.urlsafe_b64decode(raw_b64))
    assert msg["Bcc"] is None


# ---------------------------------------------------------------------------
# Failure paths — typed exceptions per status class
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_401_raises_token_revoked() -> None:
    """Gmail 401 → GmailTokenRevokedError. The cron worker's terminal-path
    branch keys on this exception type to stop retrying."""
    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(401, {"error": {"message": "Unauthorized"}}))

    with _patch_exchange_refresh(), pytest.raises(GmailTokenRevokedError):
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=db,
            sm_client=sm,
            http_client=http,
        )


@pytest.mark.asyncio
async def test_send_refresh_exchange_failure_remaps_to_token_revoked() -> None:
    """exchange_refresh_for_access raising WatchRegistrationError must
    remap to GmailTokenRevokedError. The terminal-vs-transient
    classification contract in the auto-send cron depends on this
    boundary: a watch-layer failure is observationally the same as a
    revoked token (user must re-consent to Gmail), so it has to land
    in the SAME exception class. Skipping this test would let a future
    watch-layer refactor silently downgrade refresh failures to
    GmailSendError, which the cron treats as transient — burning
    retries on a never-recoverable claim.

    Asserts http.post was never called: the failure short-circuits at
    the access-token mint step, so no Gmail Send round-trip happens."""
    from claimit_gmail import WatchRegistrationError

    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()

    with (
        patch.object(
            gmail_send_mod,
            "exchange_refresh_for_access",
            new=AsyncMock(side_effect=WatchRegistrationError("refresh rejected")),
        ),
        pytest.raises(GmailTokenRevokedError),
    ):
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=db,
            sm_client=sm,
            http_client=http,
        )
    http.post.assert_not_called()


@pytest.mark.asyncio
async def test_send_429_raises_quota_exceeded() -> None:
    """Gmail 429 → GmailQuotaExceededError. The cron worker treats this as
    transient and retries on the next tick."""
    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(429, {"error": {"message": "Quota"}}))

    with _patch_exchange_refresh(), pytest.raises(GmailQuotaExceededError):
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=db,
            sm_client=sm,
            http_client=http,
        )


@pytest.mark.asyncio
async def test_send_500_raises_generic_send_error() -> None:
    """Gmail 5xx → GmailSendError (not Quota, not TokenRevoked).
    The exception's str() carries Gmail's error message for log triage."""
    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(503, {"error": {"message": "Backend error"}}))

    with _patch_exchange_refresh(), pytest.raises(GmailSendError) as excinfo:
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=db,
            sm_client=sm,
            http_client=http,
        )
    # Distinguishes from the typed subclasses — the test must catch
    # the base class but assert it's NOT one of the specific subclasses.
    assert not isinstance(excinfo.value, GmailTokenRevokedError)
    assert not isinstance(excinfo.value, GmailQuotaExceededError)
    assert "Backend error" in str(excinfo.value)


@pytest.mark.asyncio
async def test_send_no_refresh_token_raises_token_revoked() -> None:
    """User with no gmail refresh_token_ref → GmailTokenRevokedError.
    Same recoverable state as a revoked token from the caller's
    perspective (both require user re-consent)."""
    db = _mock_db_with_user(_BASE_USER_FIXTURE)  # not connected
    sm = MagicMock()
    http = AsyncMock()

    with pytest.raises(GmailTokenRevokedError):
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=db,
            sm_client=sm,
            http_client=http,
        )
    # No HTTP call should have happened — we short-circuit at user load.
    http.post.assert_not_called()


@pytest.mark.asyncio
async def test_send_user_not_found_raises_generic_error() -> None:
    """db.find_one returns None → GmailSendError (NOT TokenRevoked,
    because the issue isn't OAuth state; the claim references a user
    that doesn't exist)."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=None)
    sm = MagicMock()
    http = AsyncMock()

    with pytest.raises(GmailSendError) as excinfo:
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=mock_db,
            sm_client=sm,
            http_client=http,
        )
    assert not isinstance(excinfo.value, GmailTokenRevokedError)
    assert "not found" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_send_malformed_response_raises_send_error() -> None:
    """200 with body missing `id` → GmailSendError. The cron worker
    must NOT silently mark a claim sent in this case."""
    db = _mock_db_with_user()
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(200, {"threadId": "t-1"}))  # no id

    with _patch_exchange_refresh(), pytest.raises(GmailSendError):
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=db,
            sm_client=sm,
            http_client=http,
        )


@pytest.mark.asyncio
async def test_send_uses_user_email_when_connected_email_missing() -> None:
    """If gmail_integration.connected_email is None, the From header
    falls back to user.email. Gmail overrides From server-side anyway,
    so this is purely for raw-MIME audit clarity."""
    user_dict = _connected_user_dict()
    gi = user_dict["gmail_integration"]
    assert isinstance(gi, dict)
    gi["connected_email"] = None  # type: ignore[index]
    db = _mock_db_with_user(user_dict)
    sm = MagicMock()
    http = AsyncMock()
    http.post = AsyncMock(return_value=_make_response(200, {"id": "m", "threadId": "t"}))

    with _patch_exchange_refresh():
        await gmail_send(
            user_id=_USER_ID,
            to="x@y.com",
            subject="S",
            body="B",
            db=db,
            sm_client=sm,
            http_client=http,
        )

    raw_b64 = http.post.call_args.kwargs["json"]["raw"]
    msg = message_from_bytes(base64.urlsafe_b64decode(raw_b64))
    assert msg["From"] == "test@example.com"  # falls back to user.email


# ---------------------------------------------------------------------------
# resolve_bcc_from_env — small helper, worth one test for the empty-string
# disable case so future tweaks don't accidentally re-enable a default
# when the operator explicitly wants no BCC.
# ---------------------------------------------------------------------------


def test_resolve_bcc_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_BCC_EMAIL", raising=False)
    assert gmail_send_mod.resolve_bcc_from_env() == "claimitbeta@gmail.com"


def test_resolve_bcc_explicit_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_BCC_EMAIL", "audit@example.com")
    assert gmail_send_mod.resolve_bcc_from_env() == "audit@example.com"


def test_resolve_bcc_empty_string_disables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_BCC_EMAIL", "")
    assert gmail_send_mod.resolve_bcc_from_env() is None
