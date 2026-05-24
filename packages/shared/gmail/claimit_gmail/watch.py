"""Gmail users.watch registration (ticket 4.15 extracted to shared package).

Tells Gmail to publish new-message notifications to our `gmail-inbound`
Pub/Sub topic, and records the resulting cursor (`watch_history_id`,
`watch_expires_at`) on the user document so the 4.17 ingest pipeline has
a starting point and the 4.16 renewal cron knows when to re-register.

Two public entry points, same core logic, different error contracts:

- `register_watch_or_raise`: raises `WatchRegistrationError` (or other
  unexpected exceptions) on failure. Use when the caller wants to count
  outcomes itself (4.16 renewal sweep).

- `register_watch_safe`: catches everything and persists the failure to
  the user doc as `watch_failed=True` + `watch_error_message`. Never
  raises. Use when the caller has no error channel — e.g., the api-gateway
  OAuth callback's `BackgroundTask`, which silently drops exceptions.

Splitting these out (rather than a single function with a `safe: bool`
flag) keeps the type signature honest at each call site: callers that
need exception-driven flow control get it without inspecting a return
value, and callers that don't need it never see the noise.

Failure modes covered:
- 4xx from Gmail (revoked grant, missing scope, malformed topicName)
- 5xx from Gmail or transient network: bounded retry with exponential
  backoff (3 attempts), then terminal.
- Refresh token missing / Secret Manager unavailable.
- Malformed response body (missing historyId / expiration).
- Pre-flight user lookup failures (not found, no refresh_token_ref).
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
from claimit_mongodb_models import MongoDBClient, User
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.cloud import secretmanager
from google.oauth2.credentials import Credentials
from starlette.concurrency import run_in_threadpool

_log = logging.getLogger(__name__)

# Gmail REST endpoint for watch registration. Same host the existing
# notifier.py code targets via raw httpx (avoiding the googleapiclient
# discovery layer to keep the container small).
_GMAIL_WATCH_URL = "https://gmail.googleapis.com/gmail/v1/users/me/watch"

# Scope needed for users.watch — same scope set we already request at
# OAuth time, so existing refresh tokens carry sufficient grant. We name
# the specific one here to keep the Credentials object's scope list
# narrow (some Google APIs reject tokens whose scope superset exceeds
# what was actually granted).
_GMAIL_WATCH_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

# Bounded retry on transient (5xx) Gmail failures. Three attempts gets us
# through a 30-second blip without burning excessive Pub/Sub budget on a
# user-initiated OAuth flow. After this, the failure is recorded on the
# user doc and watch renewal (4.16) picks it up at the next cron tick.
_MAX_ATTEMPTS = 3
_BACKOFF_BASE_SECONDS = 1.0


class WatchRegistrationError(Exception):
    """Terminal failure registering a Gmail watch.

    `terminal_message` is what gets persisted to
    `User.gmail_integration.watch_error_message`. Keep it short and
    user-readable — the settings UI may render it directly.
    """

    def __init__(self, terminal_message: str) -> None:
        super().__init__(terminal_message)
        self.terminal_message = terminal_message


async def register_watch_or_raise(
    user_id: str,
    db: MongoDBClient,
    sm_client: secretmanager.SecretManagerServiceClient,
) -> None:
    """Register a Gmail watch and persist the cursor on success.

    Raises `WatchRegistrationError` on any terminal failure (4xx, exhausted
    5xx retries, missing refresh token, malformed Gmail response, etc.).
    Other exception types may also propagate — e.g., a Mongo blip during
    the final `_persist_success` would surface as `pymongo.errors.PyMongoError`.
    Callers that need a uniform success/failure surface should wrap this
    with `register_watch_safe`.

    Idempotent at the Gmail side — Google replaces any existing watch on
    repeat calls — so it's safe to invoke even when a watch is already
    active. This is the contract the 4.16 renewal cron depends on.
    """
    user = await _load_user(db, user_id)
    access_token = await exchange_refresh_for_access(sm_client, user)
    topic = _resolve_topic_name()
    response_body = await _call_watch(access_token, topic)
    await _persist_success(db, user_id, response_body)
    _log.info("Gmail watch registered for user_id=%s", user_id)


async def register_watch_safe(
    user_id: str,
    db: MongoDBClient,
    sm_client: secretmanager.SecretManagerServiceClient,
) -> None:
    """Fire-and-forget watch registration; never raises.

    Wraps `register_watch_or_raise`: a `WatchRegistrationError` writes
    `watch_failed=True` + `watch_error_message` to the user doc, and any
    other exception does the same with a generic message and a logged
    traceback.

    Intended for the api-gateway OAuth callback's `BackgroundTask`, where
    there's no surface to report a thrown exception (FastAPI's
    `BackgroundTasks` swallow them) and we'd rather see the failure on the
    user doc + in logs than have it vanish entirely.
    """
    try:
        await register_watch_or_raise(user_id, db, sm_client)
    except WatchRegistrationError as err:
        _log.warning("Gmail watch failed for user_id=%s: %s", user_id, err.terminal_message)
        await _persist_failure(db, user_id, err.terminal_message)
    except Exception as err:
        # Unexpected — log a stack and persist a generic message so the
        # UI can prompt reconnect even if we don't know the root cause.
        _log.exception("Unexpected Gmail watch failure for user_id=%s", user_id)
        await _persist_failure(
            db, user_id, f"Internal error registering watch: {type(err).__name__}"
        )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


async def _load_user(db: MongoDBClient, user_id: str) -> User:
    try:
        uid = UUID(user_id)
    except ValueError as err:
        raise WatchRegistrationError("Invalid user id") from err
    user = await db.find_one("users", {"_id": uid}, User)
    if user is None:
        raise WatchRegistrationError("User not found")
    if not user.gmail_integration.refresh_token_ref:
        raise WatchRegistrationError("Gmail is not connected")
    return user


async def exchange_refresh_for_access(
    sm_client: secretmanager.SecretManagerServiceClient,
    user: User,
    scopes: list[str] | None = None,
) -> str:
    """Load refresh token from Secret Manager, exchange for an access token.

    Public surface — `register_watch_or_raise` (this module), the 4.17
    Gmail ingest handler in ingest-agent, and the 4.18 Gmail Send path
    in `claimit_gmail.send` all need a fresh access token to call Gmail
    APIs on a user's behalf. Mirrors
    `ingest-agent/src/notifier.py:get_gmail_access_token` so the
    confirmation-email path and the watch / ingest / claim-send paths
    stay aligned on how Gmail credentials are minted.

    `scopes` defaults to the watch scope (`gmail.readonly`) for
    backward compatibility with the original 4.15-4.16 callers. The
    4.18 Gmail Send caller passes `[GMAIL_SEND_SCOPE]` because Google's
    token endpoint binds each access token to the requested scope —
    using a token minted with `gmail.readonly` against
    `users.messages.send` returns 403 "Request had insufficient
    authentication scopes". The underlying OAuth grant (consented at
    user-OAuth time by api-gateway/services/gmail_oauth.py:32-36)
    covers readonly + send + modify, so any subset is mintable.

    Raises `WatchRegistrationError` (kept for backward compatibility
    with `register_watch_or_raise`) on any failure: missing OAuth
    client env vars, Secret Manager read failure, refresh-token grant
    rejected by Google. Callers that don't want the watch-specific
    error type can catch this and re-raise as their own (see
    `claimit_gmail.send.gmail_send` which remaps to GmailTokenRevokedError).
    """
    client_id = os.environ.get("GMAIL_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GMAIL_OAUTH_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise WatchRegistrationError("Gmail OAuth client credentials are not configured")

    secret_ref = user.gmail_integration.refresh_token_ref
    # Public API: callers don't necessarily route through `_load_user`
    # (which validated this for register_watch_or_raise's path), and
    # `python -O` strips asserts entirely. Use a typed raise so the
    # documented WatchRegistrationError contract holds for every caller
    # and runtime configuration.
    if not secret_ref:
        raise WatchRegistrationError("Gmail is not connected")
    try:
        # `access_secret_version` is a sync gRPC call that talks to Secret
        # Manager over the network — running it inline blocks the ASGI
        # loop. Offload to the default thread pool for the same reason
        # `creds.refresh` is offloaded below.
        response = await run_in_threadpool(sm_client.access_secret_version, name=secret_ref)
        refresh_token = response.payload.data.decode("utf-8")
    except Exception as err:
        raise WatchRegistrationError("Could not load refresh token") from err

    effective_scopes = scopes if scopes is not None else [_GMAIL_WATCH_SCOPE]
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=effective_scopes,
    )
    try:
        # creds.refresh is sync and hits Google's token endpoint over the
        # network — running it inline blocks the ASGI loop, which matters
        # here because this function is invoked from a BackgroundTask
        # sharing that loop with all in-flight HTTP requests.
        await run_in_threadpool(creds.refresh, GoogleAuthRequest())
    except Exception as err:
        raise WatchRegistrationError("Failed to refresh Gmail access token") from err
    if not creds.token:
        raise WatchRegistrationError("Refresh response had no access token")
    return creds.token


def _resolve_topic_name() -> str:
    """Resolve the fully-qualified Pub/Sub topic name Gmail publishes to.

    Terraform passes the .id form (projects/<project>/topics/gmail-inbound)
    via GMAIL_INBOUND_TOPIC. Fall back to constructing it from
    GCP_PROJECT_ID if the env var isn't set — useful in tests.
    """
    explicit = os.environ.get("GMAIL_INBOUND_TOPIC", "").strip()
    if explicit:
        return explicit
    project = os.environ.get("GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise WatchRegistrationError("Neither GMAIL_INBOUND_TOPIC nor GCP_PROJECT_ID is configured")
    return f"projects/{project}/topics/gmail-inbound"


async def _call_watch(access_token: str, topic_name: str) -> dict[str, Any]:
    """POST to Gmail users.watch with retry on 5xx.

    Body shape per https://developers.google.com/gmail/api/reference/rest/v1/users/watch:
        {
          "topicName": "projects/<project>/topics/<topic>",
          "labelIds": ["INBOX"],
          "labelFilterBehavior": "include"
        }

    Response:
        {"historyId": "12345", "expiration": "1779316800000"}  // ms epoch
    """
    body = {
        "topicName": topic_name,
        "labelIds": ["INBOX"],
        # `labelFilterBehavior` is the v1 successor to the deprecated
        # `labelFilterAction` field; both are accepted but the new name
        # is what current docs use.
        "labelFilterBehavior": "include",
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        last_error: str = "unknown"
        for attempt in range(_MAX_ATTEMPTS):
            try:
                response = await client.post(_GMAIL_WATCH_URL, headers=headers, json=body)
            except httpx.HTTPError as err:
                last_error = f"network error: {err!s}"
                if attempt < _MAX_ATTEMPTS - 1:
                    await _sleep_backoff(attempt)
                    continue
                raise WatchRegistrationError(last_error) from err

            if 200 <= response.status_code < 300:
                return response.json()

            if 500 <= response.status_code < 600 and attempt < _MAX_ATTEMPTS - 1:
                last_error = f"Gmail 5xx: {response.status_code}"
                await _sleep_backoff(attempt)
                continue

            # 4xx or final-attempt 5xx — terminal.
            try:
                payload = response.json()
                msg = payload.get("error", {}).get("message") or response.text[:200]
            except Exception:
                msg = response.text[:200] or f"HTTP {response.status_code}"
            raise WatchRegistrationError(f"Gmail watch rejected: {msg}")

        # Loop fell through without returning or raising — defensive only.
        raise WatchRegistrationError(last_error)


async def _sleep_backoff(attempt: int) -> None:
    """Jittered exponential backoff: 1s, 2s, 4s plus 0-1s jitter."""
    delay = _BACKOFF_BASE_SECONDS * (2**attempt) + random.uniform(0, 1)
    await asyncio.sleep(delay)


async def _persist_success(db: MongoDBClient, user_id: str, response_body: dict[str, Any]) -> None:
    history_id = response_body.get("historyId")
    expiration_ms = response_body.get("expiration")
    if not history_id or not expiration_ms:
        raise WatchRegistrationError(
            f"Gmail response missing historyId or expiration: {response_body!r}"
        )

    # Gmail returns expiration as milliseconds since epoch (string).
    try:
        expires_at = datetime.fromtimestamp(int(expiration_ms) / 1000, tz=UTC)
    except (TypeError, ValueError) as err:
        raise WatchRegistrationError(
            f"Could not parse expiration {expiration_ms!r}: {err}"
        ) from err

    uid = UUID(user_id)
    await db.partial_update(
        "users",
        uid,
        {
            "gmail_integration.watch_history_id": str(history_id),
            "gmail_integration.watch_expires_at": expires_at.isoformat(),
            "gmail_integration.watch_failed": False,
            "gmail_integration.watch_error_message": None,
        },
    )


async def _persist_failure(db: MongoDBClient, user_id: str, message: str) -> None:
    """Best-effort: log and swallow any DB error so the caller can't
    propagate a Mongo blip upward."""
    try:
        uid = UUID(user_id)
        await db.partial_update(
            "users",
            uid,
            {
                "gmail_integration.watch_failed": True,
                "gmail_integration.watch_error_message": message[:500],
            },
        )
    except Exception:
        _log.exception(
            "Failed to persist watch failure for user_id=%s (message=%s)", user_id, message
        )
