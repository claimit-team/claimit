"""Unit tests for the Gmail OAuth wrapper around google-auth-oauthlib."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from src.services.gmail_oauth import (
    GMAIL_SCOPES,
    OAuthExchangeError,
    build_authorization_url,
    build_flow,
    exchange_code_for_tokens,
)


def test_build_authorization_url_includes_state_scopes_and_offline_access() -> None:
    flow = build_flow(
        client_id="test-client-id",
        client_secret="test-client-secret",
        redirect_uri="https://example.com/callback",
    )
    url = build_authorization_url(flow, state="my-state-token")
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    assert "accounts.google.com" in parsed.netloc
    assert qs["state"] == ["my-state-token"]
    assert qs["access_type"] == ["offline"]
    assert qs["prompt"] == ["consent"]
    # Space-separated scopes — assert every required scope appears in the param.
    scope_str = qs["scope"][0]
    for scope in GMAIL_SCOPES:
        assert scope in scope_str


def test_exchange_code_for_tokens_returns_normalized_dict() -> None:
    flow = build_flow("cid", "csecret", "https://example.com/cb")

    # Stub the credentials Flow would expose after fetch_token().
    fake_expiry = datetime.now(UTC) + timedelta(hours=1)
    fake_creds = MagicMock()
    fake_creds.refresh_token = "fake-refresh-token"
    fake_creds.token = "fake-access-token"
    fake_creds.id_token = "fake-id-token-jwt"
    fake_creds.expiry = fake_expiry.replace(tzinfo=None)
    fake_creds.scopes = GMAIL_SCOPES

    with (
        patch.object(flow, "fetch_token") as mock_fetch,
        patch(
            "src.services.gmail_oauth.google_id_token.verify_oauth2_token",
            return_value={"email": "user@gmail.com", "aud": "cid"},
        ),
    ):
        # The flow.credentials attribute is read after fetch_token succeeds.
        type(flow).credentials = property(lambda self: fake_creds)  # type: ignore[assignment]
        result = exchange_code_for_tokens(flow, code="auth-code", client_id="cid")
        mock_fetch.assert_called_once_with(code="auth-code")

    assert result["refresh_token"] == "fake-refresh-token"
    assert result["access_token"] == "fake-access-token"
    assert result["connected_email"] == "user@gmail.com"
    assert result["scopes"] == GMAIL_SCOPES
    assert isinstance(result["expires_at"], datetime)


def test_exchange_code_for_tokens_missing_email_raises() -> None:
    flow = build_flow("cid", "csecret", "https://example.com/cb")
    fake_creds = MagicMock()
    fake_creds.refresh_token = "rt"
    fake_creds.token = "at"
    fake_creds.id_token = "id-token"
    fake_creds.expiry = datetime.now(UTC).replace(tzinfo=None)
    fake_creds.scopes = ["openid"]

    with (
        patch.object(flow, "fetch_token"),
        patch(
            "src.services.gmail_oauth.google_id_token.verify_oauth2_token",
            return_value={"aud": "cid"},  # no email claim
        ),
    ):
        type(flow).credentials = property(lambda self: fake_creds)  # type: ignore[assignment]
        with pytest.raises(OAuthExchangeError, match="email"):
            exchange_code_for_tokens(flow, code="c", client_id="cid")
