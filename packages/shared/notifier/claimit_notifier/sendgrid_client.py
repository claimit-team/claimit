"""SendGrid v3 mail send — multipart (text + HTML).

Picked over Gmail Send for notification email: Gmail Send sends from the
user's own OAuth token, which makes "your claim was submitted" emails
appear to come from the user themselves. SendGrid sends from a verified
ClaimIt sender, which is the right voice for system notifications.

The FROM address defaults to `claimitbeta@gmail.com` (the team mailbox we
already own and can verify as a SendGrid Single Sender). Override via
`NOTIFY_FROM_EMAIL` once the `claimit.ai` domain auth lands so the From
header switches to `notifications@claimit.ai` without a code change.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"

# Defaults are demo-grade; production should override via env once
# domain authentication is set up on SendGrid for claimit.ai.
DEFAULT_FROM_EMAIL = "claimitbeta@gmail.com"
DEFAULT_FROM_NAME = "ClaimIt"


class SendGridSendError(RuntimeError):
    """Raised when the SendGrid v3 API rejects a send."""


async def send_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
    http_client: httpx.AsyncClient | None = None,
) -> None:
    """POST to /v3/mail/send with multipart text+HTML content.

    Raises `SendGridSendError` on any non-2xx response or transport error
    so the caller can decide whether to swallow (notification fan-out
    must never fail the triggering operation).
    """
    api_key = os.environ.get("SENDGRID_API_KEY", "").strip()
    if not api_key:
        raise SendGridSendError("SENDGRID_API_KEY is not configured")

    from_email = os.environ.get("NOTIFY_FROM_EMAIL", DEFAULT_FROM_EMAIL).strip()
    from_name = os.environ.get("NOTIFY_FROM_NAME", DEFAULT_FROM_NAME).strip()

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        # Order matters: SendGrid renders the LAST content of a given type
        # as the primary; placing text/plain first then text/html means
        # text-only clients see the plaintext fallback while richer clients
        # get the HTML. Matches RFC 2046 ordering guidance for multipart
        # alternative.
        "content": [
            {"type": "text/plain", "value": text_body},
            {"type": "text/html", "value": html_body},
        ],
    }

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=8.0)
    try:
        try:
            response = await client.post(
                SENDGRID_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        except httpx.HTTPError as exc:
            raise SendGridSendError(f"SendGrid transport error: {exc}") from exc
        if response.status_code >= 300:
            # SendGrid 4xx bodies carry useful diagnostics (e.g. unverified
            # sender). Surface them so the caller's log line is debuggable.
            raise SendGridSendError(
                f"SendGrid send failed: HTTP {response.status_code} body={response.text[:300]}"
            )
    finally:
        if owns_client:
            await client.aclose()
