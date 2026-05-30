"""Email templates for the 3 claim-lifecycle notification events.

Mirrors the in-app body copy from
`apps/web/src/components/notifications/notification-row.tsx`. Keep the
phrasing aligned so users hear the same voice across surfaces.

Each builder returns `(subject, html, text)` or None when the data
shape is too thin to render a meaningful email (caller should skip
sending rather than emit a degraded message).
"""

from __future__ import annotations

import html as html_lib
import logging
from typing import Any
from uuid import UUID

from claimit_mongodb_models.enums import NotificationEventType

from .platform_labels import get_platform_label

logger = logging.getLogger(__name__)


def _frontend_base_url() -> str:
    """Resolve the user-facing app URL for deep-link CTAs.

    Empty string when unset — the CTA falls back to a label-only line
    instead of broken `href=""` anchors.
    """
    import os

    return os.environ.get("FRONTEND_BASE_URL", "").strip().rstrip("/")


def _claim_deep_link(entity_id: str | UUID | None) -> str | None:
    """Build `/claims/<id>` deep link. None when base URL or id missing."""
    base = _frontend_base_url()
    if not base or not entity_id:
        return None
    return f"{base}/claims/{entity_id}"


def _settings_link() -> str | None:
    """Build the notification-settings link for the footer."""
    base = _frontend_base_url()
    if not base:
        return None
    return f"{base}/settings/notifications"


def _greeting(user_name: str | None) -> str:
    """First-name greeting when available, else neutral 'Hi there'."""
    if not user_name:
        return "Hi there"
    first = user_name.strip().split(" ", 1)[0]
    return f"Hi {first}" if first else "Hi there"


def _wrap_html(body_inner: str, cta_html: str = "", footer_html: str = "") -> str:
    """Minimal email wrapper: system font, brand blue CTA, neutral footer."""
    return f"""\
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, -apple-system, sans-serif; color: #171717; line-height: 1.5; max-width: 560px; margin: 0 auto; padding: 24px;">
{body_inner}
{cta_html}
{footer_html}
</body>
</html>
"""


def _cta_button_html(label: str, href: str | None) -> str:
    if not href:
        return ""
    safe_href = html_lib.escape(href, quote=True)
    safe_label = html_lib.escape(label)
    return (
        f'<p style="margin: 20px 0;">'
        f'<a href="{safe_href}" style="display:inline-block;padding:12px 22px;'
        f"background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;"
        f'font-weight:500;">{safe_label}</a></p>'
    )


def _footer_html() -> str:
    settings = _settings_link()
    if not settings:
        return ""
    safe = html_lib.escape(settings, quote=True)
    return (
        '<p style="color:#737373;font-size:12px;margin-top:32px;'
        'border-top:1px solid #e5e5e5;padding-top:16px;">'
        f'Manage your notification preferences at <a href="{safe}" '
        f'style="color:#737373;">{safe}</a>.</p>'
    )


def _footer_text() -> str:
    settings = _settings_link()
    if not settings:
        return ""
    return f"\n\n---\nManage notifications: {settings}"


# Per-event builders -----------------------------------------------------


def _build_claim_drafted(
    data: dict[str, Any],
    entity_id: str | UUID | None,
    user_name: str | None,
) -> tuple[str, str, str] | None:
    platform = data.get("platform")
    platform_label = get_platform_label(platform) if isinstance(platform, str) else None
    item_title_raw = data.get("item_title")
    item_title = item_title_raw if isinstance(item_title_raw, str) and item_title_raw else None
    deep_link = _claim_deep_link(entity_id)

    if platform_label and platform_label != "—":
        subject = f"Claim drafted — your {platform_label} claim is ready to review"
        if item_title:
            body_sentence = (
                f'Your {platform_label} claim draft for "{item_title}" is ready for review.'
            )
        else:
            body_sentence = f"Your {platform_label} claim draft is ready for review."
    else:
        subject = "Claim drafted — your claim is ready to review"
        body_sentence = "Your claim draft is ready for review."

    greet = _greeting(user_name)
    text = f"{greet},\n\n{body_sentence}\n"
    if deep_link:
        text += f"\nReview claim: {deep_link}\n"
    text += _footer_text()

    body_inner = f"<p>{html_lib.escape(greet)},</p><p>{html_lib.escape(body_sentence)}</p>"
    html_body = _wrap_html(
        body_inner,
        cta_html=_cta_button_html("Review claim", deep_link),
        footer_html=_footer_html(),
    )
    return subject, html_body, text


def _build_claim_queued_auto(
    data: dict[str, Any],
    entity_id: str | UUID | None,
    user_name: str | None,
) -> tuple[str, str, str] | None:
    platform = data.get("platform")
    platform_label = get_platform_label(platform) if isinstance(platform, str) else None
    deep_link = _claim_deep_link(entity_id)

    if platform_label and platform_label != "—":
        subject = f"Claim queued — your {platform_label} claim sends in 5 minutes"
        body_sentence = (
            f"Your {platform_label} claim is queued and will be sent in 5 minutes. "
            "Review or cancel it before then."
        )
    else:
        subject = "Claim queued — sending in 5 minutes"
        body_sentence = (
            "Your claim is queued and will be sent in 5 minutes. Review or cancel it before then."
        )

    greet = _greeting(user_name)
    text = f"{greet},\n\n{body_sentence}\n"
    if deep_link:
        text += f"\nView claim: {deep_link}\n"
    text += _footer_text()

    body_inner = f"<p>{html_lib.escape(greet)},</p><p>{html_lib.escape(body_sentence)}</p>"
    html_body = _wrap_html(
        body_inner,
        cta_html=_cta_button_html("View claim", deep_link),
        footer_html=_footer_html(),
    )
    return subject, html_body, text


def _build_claim_submitted(
    data: dict[str, Any],
    entity_id: str | UUID | None,
    user_name: str | None,
) -> tuple[str, str, str] | None:
    platform = data.get("platform")
    platform_label = get_platform_label(platform) if isinstance(platform, str) else None
    deep_link = _claim_deep_link(entity_id)

    if platform_label and platform_label != "—":
        subject = f"Claim submitted — your {platform_label} claim has been sent"
        body_sentence = (
            f"Your {platform_label} claim has been sent. We'll notify you when they respond."
        )
    else:
        subject = "Claim submitted — your claim has been sent"
        body_sentence = "Your claim has been sent. We'll notify you when they respond."

    greet = _greeting(user_name)
    text = f"{greet},\n\n{body_sentence}\n"
    if deep_link:
        text += f"\nView claim: {deep_link}\n"
    text += _footer_text()

    body_inner = f"<p>{html_lib.escape(greet)},</p><p>{html_lib.escape(body_sentence)}</p>"
    html_body = _wrap_html(
        body_inner,
        cta_html=_cta_button_html("View claim", deep_link),
        footer_html=_footer_html(),
    )
    return subject, html_body, text


# Public dispatch table --------------------------------------------------

_BUILDERS = {
    NotificationEventType.CLAIM_DRAFTED: _build_claim_drafted,
    NotificationEventType.CLAIM_QUEUED_AUTO: _build_claim_queued_auto,
    NotificationEventType.CLAIM_SUBMITTED: _build_claim_submitted,
}


def build_email_for_event(
    event_type: NotificationEventType,
    data: dict[str, Any],
    entity_id: str | UUID | None,
    user_name: str | None,
) -> tuple[str, str, str] | None:
    """Return (subject, html, text) for a supported event, else None.

    None signals "no email template for this event_type" — the caller
    should skip sending rather than fall through to a generic message.
    """
    builder = _BUILDERS.get(event_type)
    if builder is None:
        return None
    return builder(data, entity_id, user_name)
