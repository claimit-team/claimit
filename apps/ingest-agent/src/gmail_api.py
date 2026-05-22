"""Gmail REST API wrappers for the 4.17 ingest pipeline.

Two HTTP calls the push handler needs:

- `history_list(access_token, start_history_id, page_token=None)`
  → Gmail `users.history.list`. Returns the deltas since
  `start_history_id` (a Gmail-managed cursor we persist on
  `User.gmail_integration.last_processed_history_id`). Paginated via
  `nextPageToken`; the handler currently consumes only the first page
  (per the 4.17 design decision to cap each push at N=5 messages, and
  the page size that returns is more than enough for that ceiling).

- `messages_get(access_token, message_id, format="full")`
  → Gmail `users.messages.get`. Returns the deeply-nested MIME-like
  JSON the `gmail_parser` module walks to build an `EmailForExtraction`.

Both call gmail.googleapis.com directly via httpx — same pattern the
existing `notifier.py` and `claimit_gmail.watch` modules use. We
intentionally avoid `google-api-python-client` (discovery layer) to
keep the container small and the surface explicit.

Error contract:
- `GmailAuthError` on 401 — the caller knows to mint a fresh access
  token (the existing one may have expired between calls in a long
  batch).
- `GmailApiError` on any other 4xx/5xx — carries the status code and a
  short message excerpt. Caller decides retry vs ack.
- httpx network errors propagate unchanged; the push handler's outer
  try/except logs and acks.

Idempotency: both endpoints are GET-equivalent (history.list and
messages.get are read-only on the Gmail side). A retry on the same
message_id is harmless.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

_log = logging.getLogger(__name__)

# Base URL + endpoint paths. Pinned to v1; Gmail's other API versions
# (drafts, threads, settings) live alongside but are out of scope.
_GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_HISTORY_LIST_PATH = f"{_GMAIL_API_BASE}/history"
_MESSAGES_GET_PATH = f"{_GMAIL_API_BASE}/messages"

# Per-call HTTP timeout. Gmail typically responds in <200ms; 10s gives
# generous headroom for transient network blips without letting one
# slow call eat the push handler's overall budget. Caller composes
# multiple of these calls per push (1 history.list + up to 5
# messages.get), so the upper-bound is roughly 6 * 10s = 60s — right
# at the Pub/Sub ack deadline. Tighter timeouts would risk false
# failures on slow days; looser timeouts would let one stuck call
# wedge the whole batch.
_GMAIL_HTTP_TIMEOUT_SECONDS = 10.0


class GmailApiError(RuntimeError):
    """Non-auth 4xx/5xx from Gmail. Carries status + short message excerpt.

    Caller decides whether to retry (handler-level Pub/Sub redelivery
    for 5xx, ack for 4xx). Distinct from `GmailAuthError` so the
    auth-retry path can branch cleanly on `except GmailAuthError`.
    """

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(f"Gmail API error {status_code}: {message}")
        self.status_code = status_code
        self.message = message


class GmailAuthError(RuntimeError):
    """401 from Gmail — access token expired or revoked.

    The caller's recommended response is to mint a fresh access token
    via `claimit_gmail.exchange_refresh_for_access` and retry once. A
    second 401 after a fresh mint indicates a deeper grant issue
    (user revoked OAuth) and should be surfaced to the user via
    `gmail_integration.watch_failed`.
    """


def _extract_error_message(response: httpx.Response) -> str:
    """Best-effort: pull `error.message` out of Gmail's JSON error body.

    Gmail's error envelope is consistent across all v1 endpoints:
        {"error": {"code": 401, "message": "Invalid Credentials", ...}}

    Falls back to the raw response text (capped at 200 chars) when
    the body isn't JSON or doesn't have the expected shape — keeps
    log lines bounded even if Gmail returns an unexpected error
    surface (e.g., HTML 502 from an upstream LB).
    """
    try:
        payload = response.json()
        msg = payload.get("error", {}).get("message")
        if msg:
            return msg
    except Exception:
        pass
    return response.text[:200] or f"HTTP {response.status_code}"


async def history_list(
    access_token: str,
    start_history_id: str,
    *,
    page_token: str | None = None,
    history_types: tuple[str, ...] = ("messageAdded",),
) -> dict[str, Any]:
    """GET users.history.list — returns deltas since `start_history_id`.

    Args:
        access_token: short-lived OAuth access token from
            `exchange_refresh_for_access`.
        start_history_id: the cursor — Gmail returns history records
            with `id > start_history_id`. The handler reads this from
            `User.gmail_integration.last_processed_history_id` (or
            `watch_history_id` on first delivery).
        page_token: opaque continuation token from a prior response's
            `nextPageToken`. None for the first page.
        history_types: which history record types to include. Default
            `messageAdded` is the only one the 4.17 pipeline cares
            about (we don't act on labels/threads/etc.). Tuple so the
            argument is hashable.

    Returns the raw JSON envelope. Shape (truncated):
        {
          "historyId": "12347",        # latest historyId AT QUERY TIME
          "history": [
            {"id": "12346", "messages": [{"id": "abc", ...}],
             "messagesAdded": [{"message": {"id": "abc", ...}}]},
            ...
          ],
          "nextPageToken": "..."       # optional
        }

    Raises:
        GmailAuthError on 401.
        GmailApiError on any other 4xx/5xx (with status + Gmail's
            error.message excerpt).
        httpx.HTTPError on network-level failures (DNS, connection
            reset, etc.) — propagates unchanged.
    """
    params: dict[str, str] = {
        "startHistoryId": start_history_id,
        # Gmail accepts repeated `historyTypes` query params; httpx
        # encodes a list value as ?historyTypes=messageAdded by default
        # so we pass a single comma-joined string only when needed.
        # For the single-element default this is a literal string.
        "historyTypes": ",".join(history_types) if len(history_types) > 1 else history_types[0],
    }
    if page_token:
        params["pageToken"] = page_token

    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=_GMAIL_HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(_HISTORY_LIST_PATH, headers=headers, params=params)

    if response.status_code == 401:
        raise GmailAuthError(_extract_error_message(response))
    if 200 <= response.status_code < 300:
        return response.json()
    raise GmailApiError(response.status_code, _extract_error_message(response))


async def messages_get(
    access_token: str,
    message_id: str,
    *,
    msg_format: str = "full",
) -> dict[str, Any]:
    """GET users.messages.get — returns one message including payload.

    Args:
        access_token: short-lived OAuth access token.
        message_id: Gmail's per-user message id (from `history_list`
            `messagesAdded[*].message.id`).
        msg_format: Gmail format param. Default `"full"` — includes
            decoded headers + base64url-encoded body parts, which is
            what `gmail_parser.parse_gmail_message` needs. `"raw"`
            would give us the original RFC822 bytes, `"metadata"`
            skips the payload entirely. Stick with "full" unless a
            specific caller needs different.

    Returns the raw JSON envelope. Shape (truncated):
        {
          "id": "abc",
          "threadId": "...",
          "snippet": "...",
          "payload": {
            "headers": [{"name": "From", "value": "..."}, ...],
            "mimeType": "multipart/alternative",
            "parts": [
              {"mimeType": "text/plain", "body": {"data": "<base64url>"}},
              {"mimeType": "text/html",  "body": {"data": "<base64url>"}},
            ],
          },
          ...
        }

    Raises:
        GmailAuthError on 401.
        GmailApiError on any other 4xx/5xx.
        httpx.HTTPError on network failures.
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {"format": msg_format}
    url = f"{_MESSAGES_GET_PATH}/{message_id}"

    async with httpx.AsyncClient(timeout=_GMAIL_HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers=headers, params=params)

    if response.status_code == 401:
        raise GmailAuthError(_extract_error_message(response))
    if 200 <= response.status_code < 300:
        return response.json()
    raise GmailApiError(response.status_code, _extract_error_message(response))
