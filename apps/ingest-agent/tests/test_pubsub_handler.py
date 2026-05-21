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


def _make_request(
    headers: dict[str, str],
    *,
    scheme: str = "http",
    host: str = "test",
):
    """Construct a minimal FastAPI Request stand-in via a fake ASGI scope.

    Default `scheme="http"` mirrors what Cloud Run actually delivers to the
    container: the load balancer terminates TLS and forwards plain HTTP.
    Tests simulating a direct HTTPS server (no proxy) can pass
    `scheme="https"`. The original Stage-3 prod bug was that this helper
    defaulted to "https" with no X-Forwarded-Proto, masking the real
    Cloud Run scheme and letting the audience-derivation bug ship.

    Always injects a Host header so request.url is built from the header
    (no port) rather than from the synthetic server tuple (which Starlette
    decorates with `:443` for non-default ports). That matches what Pub/Sub
    actually sends and lets the test's audience assertion equal the
    audience Pub/Sub mints in production.
    """
    from starlette.requests import Request as StarletteRequest

    # Caller-provided Host header wins; otherwise inject one matching `host`.
    merged_headers = {**headers}
    if not any(k.lower() == "host" for k in merged_headers):
        merged_headers["host"] = host

    scope = {
        "type": "http",
        "method": "POST",
        "scheme": scheme,
        "server": ("test", 443),
        "path": "/pubsub/gmail-inbound",
        "query_string": b"",
        "headers": [(k.lower().encode(), v.encode()) for k, v in merged_headers.items()],
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
async def test_verify_pubsub_oidc_uses_x_forwarded_proto_for_audience(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Production scenario: Cloud Run terminates TLS at the LB and forwards
    plain HTTP to the container, but sets X-Forwarded-Proto: https. The
    OIDC token's audience is the https push_endpoint, so the verifier
    must reconstruct the audience using the forwarded scheme — not the
    in-container http scheme — or Pub/Sub pushes 401 in prod.

    This test pins the regression we shipped at the original 4.15 PR:
    audience was derived from raw request.url.scheme="http", and Pub/Sub
    tokens with aud=https://... were rejected as "wrong audience".
    """
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(
        headers={
            "Authorization": "Bearer faketoken",
            "X-Forwarded-Proto": "https",
        },
        scheme="http",  # explicit: mirrors Cloud Run in-container behavior
    )

    with patch.object(
        auth.id_token,
        "verify_oauth2_token",
        return_value={
            "email": "pubsub-pusher@test-project.iam.gserviceaccount.com",
            "email_verified": True,
            "aud": "https://test/pubsub/gmail-inbound",
        },
    ) as mock_verify:
        # Should not raise.
        await auth.verify_pubsub_oidc(req)

    mock_verify.assert_called_once()
    call_args = mock_verify.call_args
    assert call_args.args[0] == "faketoken"
    # Must be the *forwarded* scheme. If this assertion ever flips back
    # to http://, OIDC verification will 401 every Pub/Sub push in prod.
    assert call_args.kwargs["audience"] == "https://test/pubsub/gmail-inbound"


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_no_proxy_falls_back_to_request_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No-proxy fallback (local dev, direct uvicorn HTTPS, test rigs):
    when there's no X-Forwarded-Proto, request.url.scheme is authoritative.
    """
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(
        headers={"Authorization": "Bearer faketoken"},
        scheme="https",  # direct HTTPS server, no proxy
    )

    with patch.object(
        auth.id_token,
        "verify_oauth2_token",
        return_value={
            "email": "pubsub-pusher@test-project.iam.gserviceaccount.com",
            "email_verified": True,
            "aud": "https://test/pubsub/gmail-inbound",
        },
    ) as mock_verify:
        await auth.verify_pubsub_oidc(req)

    mock_verify.assert_called_once()
    assert mock_verify.call_args.kwargs["audience"] == "https://test/pubsub/gmail-inbound"


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_normalizes_whitespace_and_uppercase_forwarded_proto(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Some proxies emit `X-Forwarded-Proto` with stray whitespace or in
    uppercase. Pub/Sub's `aud` claim is lowercase, so passing the raw
    header to URL.replace would 401 every push. The verifier must
    normalize to lowercase + stripped before substituting."""
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(
        headers={
            "Authorization": "Bearer faketoken",
            "X-Forwarded-Proto": "  HTTPS  ",
        },
        scheme="http",
    )

    with patch.object(
        auth.id_token,
        "verify_oauth2_token",
        return_value={
            "email": "pubsub-pusher@test-project.iam.gserviceaccount.com",
            "email_verified": True,
            "aud": "https://test/pubsub/gmail-inbound",
        },
    ) as mock_verify:
        await auth.verify_pubsub_oidc(req)

    mock_verify.assert_called_once()
    assert mock_verify.call_args.kwargs["audience"] == "https://test/pubsub/gmail-inbound"


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_handles_forwarded_proto_chain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When multiple proxies front the request, X-Forwarded-Proto is a
    comma-separated list with the original client's scheme leftmost
    (RFC 7239 / common reverse-proxy convention). We take that first
    value — anything else and we'd be using an intermediate hop's view
    of the world, not the client's."""
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(
        headers={
            "Authorization": "Bearer faketoken",
            "X-Forwarded-Proto": "https, http",
        },
        scheme="http",
    )

    with patch.object(
        auth.id_token,
        "verify_oauth2_token",
        return_value={
            "email": "pubsub-pusher@test-project.iam.gserviceaccount.com",
            "email_verified": True,
            "aud": "https://test/pubsub/gmail-inbound",
        },
    ) as mock_verify:
        await auth.verify_pubsub_oidc(req)

    mock_verify.assert_called_once()
    assert mock_verify.call_args.kwargs["audience"] == "https://test/pubsub/gmail-inbound"


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_rejects_invalid_forwarded_proto_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A header value that isn't `http` or `https` (junk, adversarial,
    or a future scheme) must NOT be passed to URL.replace — that would
    yield an audience like `ftp://...` and 401 the legitimate push.
    The verifier treats invalid values as if the header were absent
    and falls back to request.url.scheme."""
    monkeypatch.delenv("PUBSUB_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("GCP_PROJECT_ID", "test-project")
    req = _make_request(
        headers={
            "Authorization": "Bearer faketoken",
            "X-Forwarded-Proto": "ftp",
        },
        scheme="http",  # falls back to this scheme since the header is rejected
    )

    with patch.object(
        auth.id_token,
        "verify_oauth2_token",
        return_value={
            "email": "pubsub-pusher@test-project.iam.gserviceaccount.com",
            "email_verified": True,
            "aud": "http://test/pubsub/gmail-inbound",
        },
    ) as mock_verify:
        await auth.verify_pubsub_oidc(req)

    mock_verify.assert_called_once()
    # Audience falls back to request.url scheme (http), not "ftp".
    assert mock_verify.call_args.kwargs["audience"] == "http://test/pubsub/gmail-inbound"


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
