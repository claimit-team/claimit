"""Gmail watch renewal sweep (ticket 4.16).

Cloud Scheduler invokes `POST /renew-watches` daily at 03:00 UTC (see
`infra/terraform/scheduler.tf`). This module walks users whose Gmail
watch is about to expire and re-registers each one via
`claimit_gmail.register_watch_or_raise`.

Gmail watches expire seven days after creation, so a daily sweep with a
24-hour look-ahead gives us six full days of safety margin against
missed runs (CI deploy, broker outage, etc.). Without renewal, Pub/Sub
notifications silently stop and the 4.17 ingest pipeline goes dark for
the affected user until they reconnect.

Shape mirrors `monitor-agent/src/cron.py`: a single sweep entrypoint
that returns a counters dict, never raises out of the loop, logs per-
user failures with enough context to debug from Cloud Logging.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from claimit_gmail import WatchRegistrationError, register_watch_or_raise
from claimit_mongodb_models import MongoDBClient, User
from google.cloud import secretmanager

_log = logging.getLogger(__name__)

# Look ahead this far when picking renewal candidates. Gmail watches
# live 7 days from registration; running this daily means a watch is
# either renewed when ~6 days remain (typical) or, after a missed run,
# at <24h to go (recovery). The 24h window matches the spec; widening
# it costs nothing because re-registration is idempotent at Gmail's
# side and the user-facing UX doesn't notice an early renewal.
_RENEWAL_LOOKAHEAD = timedelta(hours=24)

# Soft ceiling on how many users one sweep will touch. Demo-scale is
# well below this. If we ever cross it we'd rather page than silently
# leave the tail of the queue unrenewed — adding pagination is the
# right fix at that point, not raising the cap.
_SCAN_LIMIT = 1000


async def run_renewal_sweep(
    db: MongoDBClient,
    sm_client: secretmanager.SecretManagerServiceClient,
) -> dict[str, int]:
    """Renew Gmail watches expiring within the next 24h.

    Returns a counters dict shaped `{"scanned": int, "renewed": int,
    "failed": int}`. Always finishes — per-user errors are logged + counted,
    never propagated, so one bad row can't poison the rest of the sweep
    (same contract as monitor-agent's `run_cron`).
    """
    threshold = datetime.now(UTC) + _RENEWAL_LOOKAHEAD

    # Filter selects only users who:
    #   - have an active Gmail connection,
    #   - have a refresh token we can mint a fresh access token from,
    #   - have a watch whose expiration is within the look-ahead window.
    # We do NOT exclude users with `watch_failed=True` from a prior run.
    # Re-attempting is harmless (idempotent at Gmail's side), and a
    # transient failure on day N shouldn't strand the user on day N+1.
    users = await db.find_many(
        "users",
        {
            "gmail_integration.connected": True,
            "gmail_integration.refresh_token_ref": {"$ne": None},
            "gmail_integration.watch_expires_at": {"$lt": threshold},
        },
        User,
        limit=_SCAN_LIMIT,
    )

    counters: dict[str, int] = {"scanned": len(users), "renewed": 0, "failed": 0}

    for user in users:
        try:
            await register_watch_or_raise(str(user.id), db, sm_client)
            counters["renewed"] += 1
        except WatchRegistrationError as err:
            # Expected category: Gmail rejected the call (revoked grant,
            # bad token, etc.). Warning level — operationally significant
            # but not a code bug. The user surface (`watch_failed=True`
            # on the user doc) is written by `register_watch_or_raise`'s
            # caller path when paired with `_safe`; here we let the
            # renewal cron persist the failure too.
            _log.warning(
                "renewal.failed user_id=%s reason=%s",
                user.id,
                err.terminal_message,
            )
            await _persist_failure(db, str(user.id), err.terminal_message)
            counters["failed"] += 1
        except Exception as err:
            # Unexpected category: something other than a known Gmail
            # failure — Mongo blip during _persist_success, an internal
            # exception in the shared package, etc. Log with traceback
            # so we have a forensic trail, then continue the sweep.
            _log.exception(
                "renewal.unexpected user_id=%s err=%s",
                user.id,
                err,
            )
            await _persist_failure(
                db,
                str(user.id),
                f"Internal error during renewal: {type(err).__name__}",
            )
            counters["failed"] += 1

    _log.info(
        "renewal.complete scanned=%d renewed=%d failed=%d",
        counters["scanned"],
        counters["renewed"],
        counters["failed"],
    )
    return counters


async def _persist_failure(db: MongoDBClient, user_id: str, message: str) -> None:
    """Mark watch_failed on the user doc; swallow any DB error.

    We could let DB errors bubble and have the outer try/except catch
    them, but at that point the per-user counter increment is already
    correct and a second exception inside the except clause would mask
    the original `terminal_message`. Best-effort + log is the right
    posture for a forensic write.
    """
    from uuid import UUID

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
