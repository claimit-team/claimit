"""Unit tests for the OAuth state JWT helpers."""

from __future__ import annotations

import jwt
import pytest
from src.services.state_jwt import (
    ExpiredStateError,
    InvalidStateError,
    sign_state,
    verify_state,
)

_KEY = "test-hs256-key-must-be-long-enough-for-real-use-but-anything-works-here"
_VERIFIER = "test-pkce-code-verifier-43-chars-minimum-aaaa"


def test_sign_verify_roundtrip() -> None:
    token = sign_state(
        user_id="abc-123",
        return_to="/settings/gmail",
        code_verifier=_VERIFIER,
        key=_KEY,
    )
    payload = verify_state(token, _KEY)
    assert payload["user_id"] == "abc-123"
    assert payload["return_to"] == "/settings/gmail"
    assert payload["code_verifier"] == _VERIFIER
    assert "nonce" in payload
    assert "exp" in payload
    assert "iat" in payload


def test_return_to_preserved() -> None:
    token = sign_state("u", "/onboarding/gmail", _VERIFIER, _KEY)
    payload = verify_state(token, _KEY)
    assert payload["return_to"] == "/onboarding/gmail"


def test_code_verifier_preserved() -> None:
    token = sign_state("u", "/settings/gmail", _VERIFIER, _KEY)
    payload = verify_state(token, _KEY)
    assert payload["code_verifier"] == _VERIFIER


def test_expired_token_raises_expired_state() -> None:
    # ttl_seconds=-1 produces a token whose exp is already in the past.
    token = sign_state("u", "/settings/gmail", _VERIFIER, _KEY, ttl_seconds=-1)
    with pytest.raises(ExpiredStateError):
        verify_state(token, _KEY)


def test_wrong_key_raises_invalid_state() -> None:
    token = sign_state("u", "/settings/gmail", _VERIFIER, _KEY)
    with pytest.raises(InvalidStateError):
        verify_state(token, "different-key-that-is-also-32-plus-bytes-long-for-pyjwt")


def test_malformed_token_raises_invalid_state() -> None:
    with pytest.raises(InvalidStateError):
        verify_state("not.a.jwt", _KEY)


def test_missing_code_verifier_raises_invalid_state() -> None:
    # Hand-craft a JWT that mimics a pre-fix state token (no code_verifier
    # claim) to confirm verify_state rejects it. This safely walls off any
    # in-flight pre-fix tokens that might still arrive at /callback shortly
    # after deploy.
    legacy_payload = {"user_id": "u", "return_to": "/settings/gmail"}
    legacy_token = jwt.encode(legacy_payload, _KEY, algorithm="HS256")
    with pytest.raises(InvalidStateError, match="missing required claims"):
        verify_state(legacy_token, _KEY)
