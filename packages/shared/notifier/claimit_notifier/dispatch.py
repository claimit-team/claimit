"""Top-level dispatcher — gate on user prefs, build template, send.

Invoked from `notification_helpers.write_notification_event` after a
successful Mongo upsert. Returns a `DispatchOutcome` so the caller can
log clearly without exposing PII (recipient address) in logs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from claimit_mongodb_models.enums import NotificationEventType
from claimit_mongodb_models.user import User

from .sendgrid_client import SendGridSendError, send_email
from .templates import build_email_for_event

logger = logging.getLogger(__name__)

# Phase 1 scope (BUG-124). low_confidence_extract has its own email path
# in apps/ingest-agent/src/notifier.py and is intentionally excluded
# here so a confirmation email and a Phase 1 email don't both fire.
EMAILED_EVENT_TYPES: frozenset[NotificationEventType] = frozenset(
    {
        NotificationEventType.CLAIM_DRAFTED,
        NotificationEventType.CLAIM_QUEUED_AUTO,
        NotificationEventType.CLAIM_SUBMITTED,
    }
)


@dataclass(frozen=True)
class DispatchOutcome:
    """Reason an email did or didn't fire. Logged at INFO without PII."""

    sent: bool
    reason: str


async def dispatch_email_for_notification(
    *,
    user: User | None,
    event_type: NotificationEventType,
    entity_id: str | UUID | None,
    data: dict[str, Any],
) -> DispatchOutcome:
    """Best-effort email dispatch. NEVER raises.

    Gate order (cheapest first → most expensive):
    1. event_type ∈ EMAILED_EVENT_TYPES
    2. user is loadable
    3. user.notification_prefs.email is True (master switch)
    4. event_type ∉ user.notification_prefs.muted_event_types (per-event)
    5. user.email is non-empty
    6. template renders (build_email_for_event returns non-None)
    7. SendGrid accepts
    """
    if event_type not in EMAILED_EVENT_TYPES:
        return DispatchOutcome(sent=False, reason="event_type_not_emailed")

    if user is None:
        return DispatchOutcome(sent=False, reason="user_not_found")

    prefs = user.notification_prefs
    if not prefs.email:
        return DispatchOutcome(sent=False, reason="email_pref_disabled")

    if event_type in set(prefs.muted_event_types):
        return DispatchOutcome(sent=False, reason="event_type_muted")

    to_email = (user.email or "").strip()
    if not to_email:
        return DispatchOutcome(sent=False, reason="user_email_missing")

    built = build_email_for_event(
        event_type=event_type,
        data=data,
        entity_id=entity_id,
        user_name=user.name,
    )
    if built is None:
        return DispatchOutcome(sent=False, reason="no_template")
    subject, html_body, text_body = built

    try:
        await send_email(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
        )
    except SendGridSendError as err:
        # Best-effort: log + return non-sent. Never raise — the writer's
        # try/except above us also catches, but defending here keeps the
        # outcome contract clean.
        logger.warning(
            "notifier.send_failed event_type=%s user_id=%s reason=%s",
            event_type,
            user.id,
            err,
        )
        return DispatchOutcome(sent=False, reason="sendgrid_error")
    except Exception:
        logger.exception(
            "notifier.unexpected_error event_type=%s user_id=%s",
            event_type,
            user.id,
        )
        return DispatchOutcome(sent=False, reason="unexpected_error")

    logger.info(
        "notifier.sent event_type=%s user_id=%s entity_id=%s",
        event_type,
        user.id,
        entity_id,
    )
    return DispatchOutcome(sent=True, reason="ok")
