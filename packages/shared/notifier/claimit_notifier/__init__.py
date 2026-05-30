"""ClaimIt notifier — per-event email dispatch over SendGrid.

Public entry point: `dispatch_email_for_notification`. Called from the shared
`notification_helpers.write_notification_event` chokepoint via lazy import so
services that haven't wired this package still write Mongo docs cleanly.

Scope (Phase 1 of BUG-124):
- Only the three claim lifecycle events are emailed: claim_drafted,
  claim_queued_auto, claim_submitted.
- `low_confidence_extract` already has its own email path
  (apps/ingest-agent/src/notifier.py) and is intentionally excluded here
  to avoid double-sending.
- Web push is out of scope until the FE service worker + VAPID setup lands.
"""

from .dispatch import (
    EMAILED_EVENT_TYPES,
    DispatchOutcome,
    dispatch_email_for_notification,
)

__all__ = [
    "EMAILED_EVENT_TYPES",
    "DispatchOutcome",
    "dispatch_email_for_notification",
]
