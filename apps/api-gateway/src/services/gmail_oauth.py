"""Gmail OAuth client wrapper around google-auth-oauthlib (ticket 4.14).

Wraps `google_auth_oauthlib.flow.Flow` with three thin helpers used by the
/gmail/connect and /gmail/callback route handlers:
- build_flow: constructs a Flow from in-memory client_config (no client_secret.json file)
- build_authorization_url: forces offline + consent prompt so we get a refresh_token;
  takes a caller-supplied PKCE code_verifier so the route layer (not this module)
  owns generation and persistence
- exchange_code_for_tokens: redeems the authorization code (with PKCE verifier)
  and extracts the user's actual Gmail address from the OIDC id_token's `email` claim

Scope notes:
- gmail.readonly / send / modify cover the ingestion + claim-send + archive
  workflows in WS4.
- openid + userinfo.email are needed for the id_token claim that gives us
  the authenticated Gmail address (otherwise we'd have to assume it equals
  the Firebase auth email, which is not always true). We use the full URI
  form of userinfo.email (not the short alias `email`) because Google's
  token response always returns the full URI; the library compares request
  vs response as exact strings and would otherwise raise "Scope has changed".
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from google_auth_oauthlib.flow import Flow

GMAIL_SCOPES: list[str] = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]


class OAuthExchangeError(Exception):
    """Wraps any failure during code-for-token exchange or id_token verification."""


def build_flow(client_id: str, client_secret: str, redirect_uri: str) -> Flow:
    """Construct a Flow from in-memory client config (avoids client_secret.json on disk)."""
    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }
    flow = Flow.from_client_config(client_config, scopes=GMAIL_SCOPES)
    flow.redirect_uri = redirect_uri
    return flow


def build_authorization_url(flow: Flow, state: str, code_verifier: str) -> str:
    """Build the Google OAuth consent URL.

    `access_type="offline"` plus `prompt="consent"` forces Google to issue a
    refresh_token even if the user previously consented to the same scopes.
    Without `prompt="consent"`, Google omits the refresh_token on re-consent
    and we'd have nothing to persist in Secret Manager.

    `code_verifier` is assigned to the Flow before calling `authorization_url`
    so google-auth-oauthlib uses our caller-supplied verifier (rather than its
    auto-generated one, which we'd then have no way to recover for /callback)
    when deriving the S256 code_challenge.

    `include_granted_scopes` is intentionally omitted: with it set, Google
    appends previously-granted scopes (e.g. `userinfo.profile` from the
    user's Firebase sign-in) to the token response, and google-auth-oauthlib
    then raises "Scope has changed" because the returned set no longer
    matches our request. We grant all required scopes in this single flow,
    so incremental authorization buys us nothing.
    """
    flow.code_verifier = code_verifier
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=state,
    )
    return authorization_url


def exchange_code_for_tokens(
    flow: Flow, code: str, client_id: str, code_verifier: str
) -> dict[str, Any]:
    """Redeem the auth code and return a normalized token dict.

    Returns: {refresh_token, access_token, expires_at: datetime, scopes: list[str],
              connected_email: str (from id_token.email)}

    Raises OAuthExchangeError if token fetch fails, id_token is absent, or
    id_token verification fails.

    `code_verifier` must be the same value passed to build_authorization_url
    on the /connect side. The library reads `flow.code_verifier` and includes
    it in the token request body; without it, Google rejects the exchange
    with `invalid_grant: Missing code verifier`.
    """
    flow.code_verifier = code_verifier
    try:
        flow.fetch_token(code=code)
    except Exception as err:
        raise OAuthExchangeError(f"code exchange failed: {err}") from err

    creds = flow.credentials
    if not creds.refresh_token:
        raise OAuthExchangeError(
            "no refresh_token in OAuth response; user may have previously consented "
            "without prompt=consent"
        )
    if not creds.id_token:
        raise OAuthExchangeError("no id_token in OAuth response; openid scope missing?")

    try:
        decoded = google_id_token.verify_oauth2_token(
            creds.id_token,
            google_requests.Request(),
            audience=client_id,
        )
    except Exception as err:
        raise OAuthExchangeError(f"id_token verification failed: {err}") from err

    email = decoded.get("email")
    if not email:
        raise OAuthExchangeError("id_token missing email claim")

    expires_at = creds.expiry.replace(tzinfo=UTC) if creds.expiry else datetime.now(UTC)
    scopes = list(creds.scopes) if creds.scopes else list(GMAIL_SCOPES)

    return {
        "refresh_token": creds.refresh_token,
        "access_token": creds.token,
        "expires_at": expires_at,
        "scopes": scopes,
        "connected_email": email,
    }
