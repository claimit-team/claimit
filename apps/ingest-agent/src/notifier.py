"""Low-confidence confirmation email notifications (ticket 3.5).

Sends a review email when extraction yields ``pending_confirmation``. Primary
path is Gmail Send using the user's OAuth refresh token (Secret Manager ref on
``User.gmail_integration``). Falls back to SendGrid when Gmail is unavailable
or ``SENDGRID_API_KEY`` is the only configured sender.
"""

from __future__ import annotations

import base64
import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from uuid import UUID

import httpx
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.cloud import secretmanager
from google.oauth2.credentials import Credentials

_log = logging.getLogger(__name__)

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"
DEFAULT_FROM_EMAIL = "notifications@claimit.ai"
DEFAULT_FROM_NAME = "ClaimIt"


class ConfirmationEmailError(RuntimeError):
    """Raised when no configured email transport can deliver the message."""


def _frontend_base_url() -> str:
    base = os.environ.get("FRONTEND_BASE_URL", "").strip().rstrip("/")
    if not base:
        raise ConfirmationEmailError("FRONTEND_BASE_URL is not configured")
    return base


def build_confirm_url(purchase_id: UUID | str) -> str:
    """Deep link to the purchase confirmation page (master doc §5.1)."""
    return f"{_frontend_base_url()}/confirm/{purchase_id}"


def _format_platform_label(platform: str) -> str:
    return platform.replace("_", " ").title()


def build_confirmation_email_html(
    *,
    product_name: str,
    price_paid: float,
    platform: str,
    confirm_url: str,
) -> str:
    """Minimal HTML body with purchase summary and CTA."""
    platform_label = _format_platform_label(platform)
    price_display = f"${price_paid:,.2f}"
    return f"""\
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; color: #171717; line-height: 1.5;">
  <p>We found a possible purchase in your inbox, but we're not fully confident in the extracted details.</p>
  <p><strong>{product_name}</strong><br/>
  {platform_label} · {price_display}</p>
  <p><a href="{confirm_url}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Review and confirm</a></p>
  <p style="color:#737373;font-size:14px;">If this isn't an order, you can dismiss it from the review page.</p>
</body>
</html>
"""


def build_confirmation_email_subject(product_name: str) -> str:
    return f"Confirm your purchase: {product_name}"


def _get_secret_manager_client() -> secretmanager.SecretManagerServiceClient:
    return secretmanager.SecretManagerServiceClient()


def _read_refresh_token(
    secret_ref: str, client: secretmanager.SecretManagerServiceClient | None = None
) -> str:
    sm = client or _get_secret_manager_client()
    response = sm.access_secret_version(name=secret_ref)
    return response.payload.data.decode("utf-8")


def _gmail_oauth_client_config() -> tuple[str, str]:
    client_id = os.environ.get("GMAIL_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GMAIL_OAUTH_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise ConfirmationEmailError("Gmail OAuth client credentials are not configured")
    return client_id, client_secret


def get_gmail_access_token(refresh_token: str) -> str:
    """Exchange a refresh token for a short-lived Gmail access token."""
    client_id, client_secret = _gmail_oauth_client_config()
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=[GMAIL_SEND_SCOPE],
    )
    creds.refresh(GoogleAuthRequest())
    if not creds.token:
        raise ConfirmationEmailError("Failed to obtain Gmail access token")
    return creds.token


def _encode_gmail_raw_message(
    *,
    to_email: str,
    from_email: str,
    subject: str,
    html_body: str,
) -> str:
    msg = MIMEMultipart("alternative")
    msg["To"] = to_email
    msg["From"] = from_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")


async def _send_via_gmail(
    *,
    access_token: str,
    to_email: str,
    from_email: str,
    subject: str,
    html_body: str,
    http_client: httpx.AsyncClient | None = None,
) -> None:
    raw = _encode_gmail_raw_message(
        to_email=to_email,
        from_email=from_email,
        subject=subject,
        html_body=html_body,
    )
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=30.0)
    try:
        response = await client.post(
            GMAIL_SEND_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            json={"raw": raw},
        )
        response.raise_for_status()
    finally:
        if owns_client:
            await client.aclose()


async def _send_via_sendgrid(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    http_client: httpx.AsyncClient | None = None,
) -> None:
    api_key = os.environ.get("SENDGRID_API_KEY", "").strip()
    if not api_key:
        raise ConfirmationEmailError("SENDGRID_API_KEY is not configured")

    from_email = os.environ.get("SENDGRID_FROM_EMAIL", DEFAULT_FROM_EMAIL).strip()
    from_name = os.environ.get("SENDGRID_FROM_NAME", DEFAULT_FROM_NAME).strip()
    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_body}],
    }
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=30.0)
    try:
        response = await client.post(
            SENDGRID_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()
    finally:
        if owns_client:
            await client.aclose()


async def send_confirmation_email(
    *,
    purchase_id: UUID,
    product_name: str,
    price_paid: float,
    platform: str,
    user_email: str,
    gmail_refresh_token_ref: str | None = None,
    gmail_connected_email: str | None = None,
    secret_manager_client: secretmanager.SecretManagerServiceClient | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> str:
    """Send the low-confidence confirmation email.

    Returns the transport used: ``"gmail"`` or ``"sendgrid"``.
    Raises ``ConfirmationEmailError`` if all transports fail.
    """
    confirm_url = build_confirm_url(purchase_id)
    subject = build_confirmation_email_subject(product_name)
    html_body = build_confirmation_email_html(
        product_name=product_name,
        price_paid=price_paid,
        platform=platform,
        confirm_url=confirm_url,
    )

    gmail_errors: list[str] = []
    if gmail_refresh_token_ref:
        try:
            refresh_token = _read_refresh_token(
                gmail_refresh_token_ref,
                client=secret_manager_client,
            )
            access_token = get_gmail_access_token(refresh_token)
            from_email = gmail_connected_email or user_email
            await _send_via_gmail(
                access_token=access_token,
                to_email=user_email,
                from_email=from_email,
                subject=subject,
                html_body=html_body,
                http_client=http_client,
            )
            _log.info(
                "Sent confirmation email via Gmail for purchase_id=%s to=%s",
                purchase_id,
                user_email,
            )
            return "gmail"
        except Exception as err:
            gmail_errors.append(str(err))
            _log.warning(
                "Gmail confirmation email failed for purchase_id=%s: %s",
                purchase_id,
                err,
            )

    try:
        await _send_via_sendgrid(
            to_email=user_email,
            subject=subject,
            html_body=html_body,
            http_client=http_client,
        )
        _log.info(
            "Sent confirmation email via SendGrid for purchase_id=%s to=%s",
            purchase_id,
            user_email,
        )
        return "sendgrid"
    except Exception as sendgrid_err:
        detail = "; ".join([*gmail_errors, str(sendgrid_err)])
        raise ConfirmationEmailError(
            f"Failed to send confirmation email for purchase_id={purchase_id}: {detail}"
        ) from sendgrid_err


async def maybe_send_confirmation_email(
    purchase: dict[str, Any],
    *,
    user_email: str | None = None,
    gmail_refresh_token_ref: str | None = None,
    gmail_connected_email: str | None = None,
) -> str | None:
    """Fire confirmation email when purchase status is ``pending_confirmation``.

    Swallows errors so ingestion is not blocked by notification failures.
    Returns transport name on success, else ``None``.
    """
    if purchase.get("status") != "pending_confirmation":
        return None
    if not user_email:
        _log.warning(
            "Skipping confirmation email for purchase_id=%s: user_email not provided",
            purchase.get("_id"),
        )
        return None

    try:
        return await send_confirmation_email(
            purchase_id=UUID(str(purchase["_id"])),
            product_name=str(purchase["product_name"]),
            price_paid=float(purchase["price_paid"]),
            platform=str(purchase["platform"]),
            user_email=user_email,
            gmail_refresh_token_ref=gmail_refresh_token_ref,
            gmail_connected_email=gmail_connected_email,
        )
    except ConfirmationEmailError as err:
        _log.error("%s", err)
        return None
    except Exception:
        _log.exception(
            "Unexpected error sending confirmation email for purchase_id=%s",
            purchase.get("_id"),
        )
        return None
