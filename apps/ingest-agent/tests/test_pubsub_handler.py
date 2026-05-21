"""Tests for the gmail-inbound Pub/Sub push handler (ticket 4.15).

Two surfaces under test:
- src.auth.verify_pubsub_oidc — token extraction + verification + email check
- src.main.handle_gmail_inbound — envelope parse + base64 decode + payload parse + ack

OIDC verification is exercised by setting PUBSUB_AUTH_DISABLED=1 to bypass
in the envelope-parsing tests, and by patching google.oauth2.id_token in the
auth-specific tests.
"""

from __future__ import annotations

import base64
import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from src import auth
from src.main import app


@pytest.fixture(autouse=True)
def _disable_oidc_in_handler_tests(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default to OIDC disabled. Auth-specific tests below override."""
    monkeypatch.setenv("PUBSUB_AUTH_DISABLED", "1")


def _encode_data(payload: dict[str, str]) -> str:
    return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def _envelope(data: str, message_id: str = "msg-1") -> dict[str, object]:
    return {
        "message": {
            "data": data,
            "messageId": message_id,
            "publishTime": "2026-05-21T00:00:00Z",
            "attributes": {},
        },
        "subscription": "projects/test-project/subscriptions/gmail-inbound-to-ingest",
    }


def test_handler_happy_path_returns_200_ack() -> None:
    with TestClient(app) as client:
        data = _encode_data({"emailAddress": "user@gmail.com", "historyId": "12345"})
        resp = client.post("/pubsub/gmail-inbound", json=_envelope(data))
    assert resp.status_code == 200
    assert resp.json() == {"status": "ack"}


def test_handler_invalid_envelope_returns_200_with_error_reason() -> None:
    """Malformed envelopes are logged + dropped (200) to prevent Pub/Sub
    redelivery storms on poisoned messages."""
    with TestClient(app) as client:
        resp = client.post("/pubsub/gmail-inbound", json={"not_a_real_envelope": True})
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"
    assert resp.json()["reason"] == "invalid_envelope"


def test_handler_invalid_base64_returns_200_with_error_reason() -> None:
    with TestClient(app) as client:
        resp = client.post(
            "/pubsub/gmail-inbound",
            json=_envelope("!!!not-base64!!!"),
        )
    assert resp.status_code == 200
    assert resp.json()["reason"] == "invalid_base64"


def test_handler_invalid_payload_returns_200_with_error_reason() -> None:
    """Base64 decodes fine, but inner JSON doesn't match _GmailNotification."""
    with TestClient(app) as client:
        data = _encode_data({"not": "a gmail notification"})  # type: ignore[arg-type]
        resp = client.post("/pubsub/gmail-inbound", json=_envelope(data))
    assert resp.status_code == 200
    assert resp.json()["reason"] == "invalid_payload"


# ---------------------------------------------------------------------------
# OIDC verification — exercised against src.auth directly.
# ---------------------------------------------------------------------------


def _make_request(headers: dict[str, str], url: str = "http://test/pubsub/gmail-inbound"):
    """Construct a minimal FastAPI Request stand-in via the test client."""
    # auth.verify_pubsub_oidc only reads request.headers and request.url, so
    # a Starlette Request built from a fake ASGI scope is sufficient.
    from starlette.requests import Request as StarletteRequest

    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "https",
        "server": ("test", 443),
        "path": "/pubsub/gmail-inbound",
        "query_string": b"",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "root_path": "",
    }
    return StarletteRequest(scope)


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_disabled_returns_without_calling_google(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PUBSUB_AUTH_DISABLED", "1")
    # No headers required when disabled.
    req = _make_request(headers={})
    # Should not raise.
    await auth.verify_pubsub_oidc(req)


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_missing_authorization_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(headers={})
    with pytest.raises(HTTPException) as exc:
        await auth.verify_pubsub_oidc(req)
    assert exc.value.status_code == 401
    assert "missing" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_malformed_authorization_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(headers={"Authorization": "Basic abc"})
    with pytest.raises(HTTPException) as exc:
        await auth.verify_pubsub_oidc(req)
    assert exc.value.status_code == 401
    assert "malformed" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_rejects_token_from_wrong_sa(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(headers={"Authorization": "Bearer faketoken"})

    with (
        patch.object(
            auth.id_token,
            "verify_oauth2_token",
            return_value={
                "email": "attacker@example.com",
                "email_verified": True,
                "aud": "http://test/pubsub/gmail-inbound",
            },
        ),
        pytest.raises(HTTPException) as exc,
    ):
        await auth.verify_pubsub_oidc(req)
    assert exc.value.status_code == 401
    assert "unexpected service account" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_rejects_unverified_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(headers={"Authorization": "Bearer faketoken"})

    with (
        patch.object(
            auth.id_token,
            "verify_oauth2_token",
            return_value={
                "email": "pubsub-pusher@test-project.iam.gserviceaccount.com",
                "email_verified": False,
                "aud": "http://test/pubsub/gmail-inbound",
            },
        ),
        pytest.raises(HTTPException) as exc,
    ):
        await auth.verify_pubsub_oidc(req)
    assert exc.value.status_code == 401
    assert "not verified" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_accepts_valid_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(headers={"Authorization": "Bearer faketoken"})

    with patch.object(
        auth.id_token,
        "verify_oauth2_token",
        return_value={
            "email": "pubsub-pusher@test-project.iam.gserviceaccount.com",
            "email_verified": True,
            "aud": "http://test/pubsub/gmail-inbound",
        },
    ) as mock_verify:
        # Should not raise.
        await auth.verify_pubsub_oidc(req)

    # Pin the call shape so a future refactor that drops the audience kwarg
    # (and silently accepts any token from any service) fails loudly here.
    mock_verify.assert_called_once()
    call_args = mock_verify.call_args
    assert call_args.args[0] == "faketoken"
    # `audience` is derived from request.url — proves the runtime-derived
    # audience logic actually wires through, not just that the function
    # was called. Scheme is https because _make_request's scope sets
    # "scheme": "https" (matching what Cloud Run / Pub/Sub use in prod).
    assert call_args.kwargs["audience"] == "https://test/pubsub/gmail-inbound"


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_propagates_signature_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """google-auth raises ValueError on every verification failure (signature,
    expiration, audience mismatch). All become 401."""
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(headers={"Authorization": "Bearer faketoken"})

    with (
        patch.object(
            auth.id_token,
            "verify_oauth2_token",
            side_effect=ValueError("Token expired"),
        ),
        pytest.raises(HTTPException) as exc,
    ):
        await auth.verify_pubsub_oidc(req)
    assert exc.value.status_code == 401
    assert "invalid oidc token" in exc.value.detail.lower()
