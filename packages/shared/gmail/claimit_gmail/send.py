"""Gmail Send API for outbound claim emails (ticket 4.18).

Sends an email AS the connected user via Gmail's `users.messages.send`
endpoint. The sent message appears in the user's own Sent folder and
the recipient sees the user's address in the From header — exactly
what the Hilton hero flow needs (price-protection request "from" the
user, not from a generic notifications@ address).

Mirrors the OAuth-refresh pattern in `claimit_gmail.watch.exchange_refresh_for_access`
which is reused here as the access-token mint step. The Gmail Send
scope (`https://www.googleapis.com/auth/gmail.send`) is already in the
OAuth grant requested by api-gateway (`services/gmail_oauth.py:34`),
so existing connected users carry sufficient permission without a
re-consent flow.

Why a separate module from `watch.py`:
- watch.py handles the inbound pipeline registration (one-time per
  user, idempotent). send.py is per-claim and has its own error
  taxonomy (token revoked vs quota vs malformed request).
- Splitting keeps each module's failure modes typed at the public API
  level — callers don't have to inspect a generic exception and
  pattern-match on string messages.

Out of scope for v1 (per master doc decisions during 4.18 design):
- Attachments. Gmail Send accepts inline base64 attachments via
  multipart MIME; the claim's evidence_screenshot_url is a GCS URL
  that would need fetch + encode + multipart assembly. Body-only is
  enough for the demo; attachments are a follow-up if user feedback
  requires them.
- SendGrid fallback. The spec's "from user's address" requirement is
  fundamentally incompatible with SendGrid's notifications@ sender;
  a Gmail failure surfaces to the caller (claim stays in
  QUEUED_FOR_SEND / PENDING) and the user retries. Notifier.py's
  SendGrid fallback handles confirmation emails (which DO send from
  notifications@) — different semantic, different module.
"""

from __future__ import annotations

import base64
import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from email.mime.text import MIMEText
from uuid import UUID

import httpx
from claimit_mongodb_models import MongoDBClient, User
from google.cloud import secretmanager

from .watch import WatchRegistrationError, exchange_refresh_for_access

_log = logging.getLogger(__name__)

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

# Same scope value used in apps/api-gateway/src/services/gmail_oauth.py:34
# and apps/ingest-agent/src/notifier.py:28. Existing connected users
# already have this grant from the OAuth consent flow.
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

# HTTP timeout for the Gmail Send call. Long enough for a slow Google
# round-trip but short enough that a stuck request doesn't lock up the
# auto-send cron worker (Cloud Scheduler attempt_deadline is 60s).
_SEND_TIMEOUT_SECONDS = 30.0


class GmailSendError(Exception):
    """Generic failure sending via Gmail. The caller should log and
    decide whether to retry or surface to the user.

    Subclasses cover the two states the auto-send worker treats
    differently:
    - `GmailTokenRevokedError`: stop trying for this user until they
      re-connect Gmail. The cron loop should NOT pick this claim up
      again on the next tick.
    - `GmailQuotaExceededError`: transient; retry next tick is fine.
    """


class GmailTokenRevokedError(GmailSendError):
    """User's refresh token was revoked or the OAuth grant lapsed.
    Caller should mark the user's Gmail integration disconnected so
    the cron doesn't re-attempt every minute."""


class GmailQuotaExceededError(GmailSendError):
    """Per-user or project-wide Gmail quota exceeded.
    Caller can leave the claim queued; the next cron tick will retry."""


@dataclass(frozen=True)
class GmailSendResult:
    """Return shape for `gmail_send` — captured at the moment the
    Gmail API returns success.

    `message_id` is the value the caller persists to
    `claim.gmail_message_id`. `thread_id` is informational (useful for
    grouping a reply if the platform CS replies). `sent_at` is the
    server-local UTC timestamp of the successful POST — sufficient for
    `claim.submitted_at` (we don't have access to Gmail's server clock,
    but the skew is small enough to ignore for tracking purposes)."""

    message_id: str
    thread_id: str
    sent_at: datetime


async def gmail_send(
    *,
    user_id: str,
    to: str,
    subject: str,
    body: str,
    bcc: str | None = None,
    db: MongoDBClient,
    sm_client: secretmanager.SecretManagerServiceClient,
    http_client: httpx.AsyncClient | None = None,
) -> GmailSendResult:
    """Send `body` from `user_id`'s Gmail to `to`, optionally BCCing.

    Args:
        user_id: The authenticated user whose Gmail account sends the
            mail. We load `User.gmail_integration.refresh_token_ref`
            from Mongo and exchange it for a short-lived access token.
        to: Recipient address (the platform's CS email).
        subject: Email subject line.
        body: Plain-text body. (v1 sends text/plain; LLM-generated
            claim drafts are prose, not HTML, so no escape concerns.
            If a future ticket wants HTML, mirror notifier.py's
            `_send_via_gmail` which uses MIMEText("html").)
        bcc: Optional BCC for audit visibility — typically the
            CLAIMIT_BCC_EMAIL env var so the team sees what claims
            went out during the demo.
        db: MongoDBClient for the user lookup. Caller owns the
            connection lifecycle.
        sm_client: Secret Manager client for the refresh-token read.
            Caller owns the lifecycle.
        http_client: Optional shared httpx client. When None, this
            function opens and closes its own. Tests inject a mock.

    Returns:
        GmailSendResult with the Gmail message_id, thread_id, and the
        local UTC timestamp of the successful send.

    Raises:
        GmailTokenRevokedError: 401 from Gmail OR refresh-token exchange
            failed (user re-consent needed).
        GmailQuotaExceededError: 429 from Gmail (transient — retry later).
        GmailSendError: any other 4xx/5xx, network error, or malformed
            response.
    """
    # exchange_refresh_for_access raises WatchRegistrationError on any
    # token failure; remap to GmailTokenRevokedError so callers handle a
    # single typed exception per failure class. The original error is
    # chained via `from err` so traceback / debug context survives.
    user = await _load_user_with_gmail(db, user_id)
    try:
        access_token = await exchange_refresh_for_access(sm_client, user)
    except WatchRegistrationError as err:
        raise GmailTokenRevokedError(
            f"Could not mint Gmail access token for user_id={user_id}: {err.terminal_message}"
        ) from err

    # Guard the MIME assembly. Bad input (subject with un-encodable
    # control characters, a body wider than the email package's
    # header-folding can handle) raises stdlib exceptions that aren't
    # GmailSendError, which would bypass the caller's terminal/
    # transient classification. Wrapping here gives the caller a
    # single exception family for every Gmail-send failure mode.
    try:
        raw = _build_raw_message(
            to=to,
            from_email=_resolve_from_email(user),
            subject=subject,
            body=body,
            bcc=bcc,
        )
    except Exception as err:
        raise GmailSendError(
            f"Failed to build Gmail MIME payload for user_id={user_id}: {err!s}"
        ) from err

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=_SEND_TIMEOUT_SECONDS)
    try:
        response = await client.post(
            GMAIL_SEND_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw},
        )
    except httpx.HTTPError as err:
        raise GmailSendError(f"Network error sending via Gmail: {err!s}") from err
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code == 401:
        raise GmailTokenRevokedError(
            f"Gmail returned 401 for user_id={user_id}: token revoked or scope missing"
        )
    if response.status_code == 429:
        raise GmailQuotaExceededError(
            f"Gmail returned 429 for user_id={user_id}: per-user or project quota exceeded"
        )
    if not 200 <= response.status_code < 300:
        # Pull the Gmail error message if present — it's the most
        # actionable signal in logs ("Invalid To header", etc.).
        try:
            payload = response.json()
            msg = payload.get("error", {}).get("message") or response.text[:200]
        except Exception:
            msg = response.text[:200] or f"HTTP {response.status_code}"
        raise GmailSendError(f"Gmail send failed ({response.status_code}): {msg}")

    try:
        body_json = response.json()
        message_id = body_json["id"]
        thread_id = body_json.get("threadId", "")
    except (ValueError, KeyError) as err:
        raise GmailSendError(
            f"Gmail send returned malformed response: {response.text[:200]!r}"
        ) from err

    sent_at = datetime.now(UTC)
    _log.info(
        "gmail_send.ok user_id=%s message_id=%s to=%s",
        user_id,
        message_id,
        to,
    )
    return GmailSendResult(message_id=message_id, thread_id=thread_id, sent_at=sent_at)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


async def _load_user_with_gmail(db: MongoDBClient, user_id: str) -> User:
    """Load the user and verify Gmail is connected.

    Raises GmailTokenRevokedError rather than a generic ValueError because
    "no refresh token" is the same recoverable state as "token
    revoked" from the caller's perspective — both require the user to
    re-connect Gmail before claims for them can send."""
    try:
        uid = UUID(user_id)
    except ValueError as err:
        raise GmailSendError(f"Invalid user id: {user_id!r}") from err
    user = await db.find_one("users", {"_id": uid}, User)
    if user is None:
        raise GmailSendError(f"User not found: {user_id}")
    if not user.gmail_integration.refresh_token_ref:
        raise GmailTokenRevokedError(f"Gmail not connected for user_id={user_id}")
    return user


def _resolve_from_email(user: User) -> str:
    """Pick the From address Gmail will display.

    Gmail Send overrides whatever we put here with the authenticated
    user's actual address — so this value is informational. We still
    set it to `user.gmail_integration.connected_email` (or fall back
    to `user.email`) so the raw MIME bytes are self-describing in
    audit logs / BCC inboxes that read From: directly."""
    gi = user.gmail_integration
    connected = getattr(gi, "connected_email", None)
    if connected:
        return connected
    return user.email


def _build_raw_message(
    *,
    to: str,
    from_email: str,
    subject: str,
    body: str,
    bcc: str | None,
) -> str:
    """Assemble base64url-encoded RFC 2822 message Gmail Send accepts.

    Plain-text only for v1. The encoding matches
    notifier.py:_encode_gmail_raw_message — same Gmail spec, different
    content type (text vs html). Using stdlib `email.mime` keeps us
    free of charset / header-folding bugs we'd have to handcraft."""
    msg = MIMEText(body, "plain", "utf-8")
    msg["To"] = to
    msg["From"] = from_email
    msg["Subject"] = subject
    if bcc:
        msg["Bcc"] = bcc
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")


def resolve_bcc_from_env() -> str | None:
    """Read the optional audit-BCC address from env.

    Opt-in by default: returns None unless `CLAIMIT_BCC_EMAIL` is
    explicitly set. The previous default ("claimitbeta@gmail.com")
    would have silently BCC'd every outbound claim from any
    environment that forgot to set the var — including production —
    leaking the user-sender's identity + the platform CS address into
    our internal mailbox. CodeRabbit Round 2 flagged this as a
    privacy footgun.

    The demo BCC is now wired in `infra/terraform/main.tf` as an
    explicit `CLAIMIT_BCC_EMAIL` entry on the claim-agent Cloud Run
    env block — so the demo audit trail still works, but production
    or any future environment must consciously opt in."""
    raw = os.environ.get("CLAIMIT_BCC_EMAIL", "").strip()
    return raw or None
