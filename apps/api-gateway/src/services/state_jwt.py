"""HS256 state JWT for the Gmail OAuth flow (ticket 4.14).

The OAuth `state` parameter has three jobs in this codebase:
- CSRF protection: an attacker initiating /gmail/callback on a victim's
  browser cannot forge a valid state without the HS256 key.
- Carrying per-request context (user_id, return_to) across the round-trip
  to Google so the callback doesn't need its own session lookup.
- Carrying the PKCE code_verifier across the round-trip. google-auth-oauthlib
  auto-enables PKCE on the authorization URL, but our api-gateway is stateless,
  so the verifier generated for /connect would be lost by the time /callback
  runs. Embedding it in the signed state JWT (which Google echoes back
  unchanged) makes the verifier available for the token exchange.

Key material is the raw 64-char string mounted from Secret Manager as the
`STATE_JWT_SECRET` env var (see infra/terraform/main.tf), passed into the
sign/verify functions by the route layer via the deps singleton.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt


class ExpiredStateError(Exception):
    """State JWT was signed correctly but its `exp` is in the past."""


class InvalidStateError(Exception):
    """State JWT signature mismatch, malformed token, or missing required claims."""


def sign_state(
    user_id: str,
    return_to: str,
    code_verifier: str,
    key: str,
    ttl_seconds: int = 600,
) -> str:
    """Mint a short-lived HS256 token binding user_id + return_to + code_verifier.

    `nonce` is 16 url-safe bytes — not validated server-side (single-use replay
    protection would need a store); included so identical (user_id, return_to)
    pairs minted in the same second still produce distinct tokens.

    `code_verifier` is the PKCE verifier (RFC 7636 §4.1, 43-128 url-safe chars).
    Carried inside the JWT so /callback can pass it to the token exchange and
    Google's check against the original code_challenge succeeds.
    """
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "user_id": user_id,
        "return_to": return_to,
        "code_verifier": code_verifier,
        "exp": now + timedelta(seconds=ttl_seconds),
        "iat": now,
        "nonce": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, key, algorithm="HS256")


def verify_state(token: str, key: str) -> dict[str, Any]:
    """Decode + validate the state token. Raises ExpiredState / InvalidState."""
    try:
        payload = jwt.decode(token, key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as err:
        raise ExpiredStateError("state token expired") from err
    except jwt.InvalidTokenError as err:
        raise InvalidStateError("state token invalid") from err

    if "user_id" not in payload or "return_to" not in payload or "code_verifier" not in payload:
        raise InvalidStateError("state token missing required claims")
    return payload
