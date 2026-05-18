"""Window-proximity cadence ladder for monitor-agent cron.

Per master doc §5.4: as a purchase's price-protection window approaches
expiry, we poll more often. Pure functions — easy to spot-check.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from claimit_mongodb_models import Purchase

CADENCE_LONG_MIN = 360  # > 7 days remaining
CADENCE_MID_MIN = 60  # 1-7 days remaining
CADENCE_SHORT_MIN = 15  # < 24 h remaining


def compute_target_cadence_minutes(window_expires: datetime, now: datetime) -> int:
    """Pick the cadence bucket for a purchase given how much window is left."""
    remaining = window_expires - now
    if remaining < timedelta(hours=24):
        return CADENCE_SHORT_MIN
    if remaining <= timedelta(days=7):
        return CADENCE_MID_MIN
    return CADENCE_LONG_MIN


def is_due(purchase: Purchase, now: datetime) -> bool:
    """True if the purchase has never been checked, or the cadence interval has elapsed."""
    if purchase.last_checked_at is None:
        return True
    elapsed = now - purchase.last_checked_at
    return elapsed >= timedelta(minutes=purchase.monitoring_cadence_minutes)
