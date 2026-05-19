"""Gmail integration endpoints: /gmail/status, /gmail/connect, /gmail/callback.

The OAuth flow uses Pattern B (backend handles the Google redirect target):
- Frontend calls GET /connect (Bearer auth), receives Google's authorization URL.
- Frontend navigates the user to that URL.
- Google redirects to GET /callback (PUBLIC — auth via the signed state JWT,
  not Bearer, because Google can't forward Authorization headers).
- /callback exchanges the code, persists the refresh_token in Secret Manager,
  updates User.gmail_integration, and 302s the user back to the frontend
  with ?status=connected (or ?status=error&reason=... on failure).

See infra/terraform/iam.tf for the project-level secretmanager.admin role
needed to create + version the gmail-refresh-token-{user_id} secrets.
"""

from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated

from claimit_mongodb_models import MongoDBClient, User
from claimit_mongodb_models.user import GmailIntegration
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from google.cloud import secretmanager

from ..deps import get_db, get_secret_manager_client, get_state_jwt_key, get_token_cache
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError
from ..serializers import serialize_user
from ..services import gmail_oauth, secret_manager, state_jwt
from ..services.token_cache import AccessTokenCache

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/gmail", tags=["gmail"])

# Only these prefixes are valid post-OAuth redirect destinations. Anything
# else is a (likely-malicious) open-redirect attempt and gets rejected at
# /connect time. We allow exact match + nested paths (e.g. /settings/gmail/sync)
# so future deep-links don't require updating this list.
_ALLOWED_RETURN_TO_PREFIXES: tuple[str, ...] = (
    "/settings/gmail",
    "/onboarding/gmail",
)


def _is_allowed_return_to(return_to: str) -> bool:
    return any(
        return_to == prefix or return_to.startswith(prefix + "/")
        for prefix in _ALLOWED_RETURN_TO_PREFIXES
    )


def _redirect_error(return_to: str, reason: str) -> RedirectResponse:
    """Build a 302 to the frontend carrying ?status=error&reason=<machine_readable>."""
    base = os.environ["FRONTEND_BASE_URL"]
    return RedirectResponse(
        url=f"{base}{return_to}?status=error&reason={reason}",
        status_code=302,
    )


@router.get("/status")
async def get_gmail_status(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    """Return Gmail integration status for the authenticated user.

    `email` is the actual connected Gmail address (from the OAuth id_token's
    `email` claim, persisted by /callback into User.gmail_integration.connected_email).
    It can differ from `user.email` (the Firebase login email) — e.g. user
    signed in with Google as alice@gmail.com but connected work@company.com.
    """
    g = user.gmail_integration
    return {
        "connected": g.connected,
        "email": g.connected_email if g.connected else None,
        "scopes": list(g.scopes_granted),
    }


@router.get("/connect")
async def gmail_connect(
    user: Annotated[User, Depends(get_current_user)],
    state_key: Annotated[str, Depends(get_state_jwt_key)],
    return_to: Annotated[str, Query()] = "/settings/gmail",
) -> dict[str, str]:
    """Authenticated. Returns a Google OAuth consent URL with a signed state JWT."""
    if not _is_allowed_return_to(return_to):
        raise ApiError(
            "invalid_return_to",
            f"return_to must start with one of {list(_ALLOWED_RETURN_TO_PREFIXES)}",
            status_code=400,
        )

    client_id = os.environ["GMAIL_OAUTH_CLIENT_ID"]
    client_secret = os.environ["GMAIL_OAUTH_CLIENT_SECRET"]
    redirect_uri = os.environ["GMAIL_OAUTH_REDIRECT_URI"]

    # PKCE: 32 bytes -> 43-char url-safe verifier, the RFC 7636 §4.1 minimum.
    # We carry it inside the state JWT so /callback can pass it back to the
    # token exchange (api-gateway is stateless across requests).
    code_verifier = secrets.token_urlsafe(32)

    state = state_jwt.sign_state(
        user_id=str(user.id),
        return_to=return_to,
        code_verifier=code_verifier,
        key=state_key,
    )
    flow = gmail_oauth.build_flow(client_id, client_secret, redirect_uri)
    authorization_url = gmail_oauth.build_authorization_url(
        flow, state=state, code_verifier=code_verifier
    )
    return {"authorization_url": authorization_url}


@router.get("/callback")
async def gmail_callback(
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    db: Annotated[MongoDBClient, Depends(get_db)],
    sm_client: Annotated[
        secretmanager.SecretManagerServiceClient, Depends(get_secret_manager_client)
    ],
    state_key: Annotated[str, Depends(get_state_jwt_key)],
    token_cache: Annotated[AccessTokenCache, Depends(get_token_cache)],
) -> RedirectResponse:
    """Public OAuth callback. Auth comes from the signed state JWT, not Bearer.

    On any failure we 302 back to the frontend with ?status=error&reason=<x>
    rather than returning a JSON error envelope — the user is mid-browser-flow
    and needs to land on a UI that can explain what went wrong.
    """
    # 1. Verify state. Fallback redirect target on state failure is /settings/gmail
    # because we can't trust return_to inside an invalid token.
    try:
        payload = state_jwt.verify_state(state, state_key)
    except state_jwt.ExpiredStateError:
        return _redirect_error("/settings/gmail", "state_expired")
    except state_jwt.InvalidStateError:
        return _redirect_error("/settings/gmail", "state_invalid")

    user_id_str: str = payload["user_id"]
    return_to: str = payload["return_to"]
    code_verifier: str = payload["code_verifier"]

    # 2. Exchange code for tokens (refresh_token + access_token + id_token email).
    # The code_verifier from the state JWT must match the code_challenge sent
    # to Google in /connect, otherwise Google returns invalid_grant.
    client_id = os.environ["GMAIL_OAUTH_CLIENT_ID"]
    client_secret = os.environ["GMAIL_OAUTH_CLIENT_SECRET"]
    redirect_uri = os.environ["GMAIL_OAUTH_REDIRECT_URI"]
    project_id = os.environ.get("GCP_PROJECT_ID") or os.environ["GOOGLE_CLOUD_PROJECT"]

    try:
        flow = gmail_oauth.build_flow(client_id, client_secret, redirect_uri)
        tokens = gmail_oauth.exchange_code_for_tokens(
            flow, code, client_id, code_verifier=code_verifier
        )
    except gmail_oauth.OAuthExchangeError as err:
        _log.warning("Gmail code exchange failed for user_id=%s: %s", user_id_str, err)
        return _redirect_error(return_to, "code_exchange_failed")

    try:
        # 3. Load the User document FIRST — if the user was deleted between
        # /connect and /callback, bailing out here avoids creating an orphaned
        # refresh-token secret in Secret Manager.
        uid = uuid.UUID(user_id_str)
        user = await db.find_one("users", {"_id": uid}, User)
        if user is None:
            _log.error("Gmail callback: user %s not found in MongoDB", user_id_str)
            return _redirect_error(return_to, "internal_error")

        # 4. Persist refresh_token in Secret Manager.
        secret_ref = secret_manager.store_refresh_token(
            sm_client, project_id, user_id_str, tokens["refresh_token"]
        )

        # 5. Update the User document with the new gmail_integration state.
        now = datetime.now(UTC)
        user.gmail_integration.connected = True
        user.gmail_integration.connected_at = now
        user.gmail_integration.connected_email = tokens["connected_email"]
        user.gmail_integration.scopes_granted = tokens["scopes"]
        user.gmail_integration.refresh_token_ref = secret_ref
        await db.upsert("users", user.id, user)

        # 6. Cache the access token so the next API call doesn't need to refresh.
        token_cache.set(
            user_id_str,
            tokens["access_token"],
            tokens["expires_at"].timestamp(),
        )
    except Exception as err:
        _log.exception("Gmail callback post-exchange failure for user_id=%s: %s", user_id_str, err)
        return _redirect_error(return_to, "internal_error")

    # 7. Send the user back to the frontend page they started on.
    base = os.environ["FRONTEND_BASE_URL"]
    return RedirectResponse(url=f"{base}{return_to}?status=connected", status_code=302)


@router.post("/disconnect")
async def gmail_disconnect(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Clear the user's Gmail integration state. Idempotent.

    Hackathon scope: this is a DB-only flip — we do NOT revoke the OAuth grant
    at Google, do NOT delete the refresh token from Secret Manager, and do NOT
    call gmail.users.stop() to tear down any active push subscription. Those
    are tracked TODOs for post-MVP. Re-connect simply overwrites the same
    fields via /gmail/callback (and re-stores the refresh token at the same
    Secret Manager path), so leaving the secret behind doesn't leak access —
    once we set `connected=False` the rest of the system stops looking at it.
    """
    cleared = GmailIntegration(
        connected=False,
        connected_at=None,
        connected_email=None,
        scopes_granted=[],
        refresh_token_ref=None,
        watch_history_id=None,
        watch_expires_at=None,
        last_processed_message_id=None,
    )
    matched = await db.partial_update(
        "users",
        user.id,
        {"gmail_integration": cleared.model_dump(mode="json")},
        model=User,
    )
    if not matched:
        raise ApiError("user_not_found", "User document was removed", status_code=404)

    user.gmail_integration = cleared
    return {"user": serialize_user(user)}
