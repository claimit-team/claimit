"""Unit tests for the Gmail OAuth wrapper around google-auth-oauthlib."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, PropertyMock, patch
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
    url = build_authorization_url(
        flow,
        state="my-state-token",
        code_verifier="test-pkce-verifier-43chars-aaaaaaaaaaaaaaaaaaa",
    )
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
    # PKCE: verifier we passed in was applied to the Flow, and Google sees
    # the matching S256 challenge.
    assert flow.code_verifier == "test-pkce-verifier-43chars-aaaaaaaaaaaaaaaaaaa"
    assert qs["code_challenge_method"] == ["S256"]
    assert "code_challenge" in qs


def test_build_authorization_url_uses_caller_supplied_verifier() -> None:
    """Two distinct verifiers must produce two distinct challenges (no library override)."""
    flow_a = build_flow("cid", "cs", "https://example.com/cb")
    flow_b = build_flow("cid", "cs", "https://example.com/cb")
    url_a = build_authorization_url(
        flow_a, state="s", code_verifier="verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )
    url_b = build_authorization_url(
        flow_b, state="s", code_verifier="verifier-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    )
    challenge_a = parse_qs(urlparse(url_a).query)["code_challenge"][0]
    challenge_b = parse_qs(urlparse(url_b).query)["code_challenge"][0]
    assert challenge_a != challenge_b


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

    # patch.object scopes the Flow.credentials property mock to this test;
    # assigning to type(flow).credentials directly would leak across tests.
    with (
        patch.object(flow, "fetch_token") as mock_fetch,
        patch(
            "src.services.gmail_oauth.google_id_token.verify_oauth2_token",
            return_value={"email": "user@gmail.com", "aud": "cid"},
        ),
        patch.object(type(flow), "credentials", new_callable=PropertyMock) as mock_credentials,
    ):
        mock_credentials.return_value = fake_creds
        result = exchange_code_for_tokens(
            flow,
            code="auth-code",
            client_id="cid",
            code_verifier="test-pkce-verifier-43chars-aaaaaaaaaaaaaaaaaaa",
        )
        mock_fetch.assert_called_once_with(code="auth-code")

    # Verifier must be assigned on the Flow before fetch_token so the library
    # includes it in the token-exchange POST body.
    assert flow.code_verifier == "test-pkce-verifier-43chars-aaaaaaaaaaaaaaaaaaa"
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
        patch.object(type(flow), "credentials", new_callable=PropertyMock) as mock_credentials,
    ):
        mock_credentials.return_value = fake_creds
        with pytest.raises(OAuthExchangeError, match="email"):
            exchange_code_for_tokens(
                flow,
                code="c",
                client_id="cid",
                code_verifier="test-pkce-verifier-43chars-aaaaaaaaaaaaaaaaaaa",
            )
