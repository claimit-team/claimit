"""Shared form-submission security helpers for public unauthenticated write endpoints.

Provides honeypot detection, per-IP rate limiting, per-email daily dedup,
source IP extraction, and email format validation.
"""

from __future__ import annotations

import re
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from time import time
from typing import TYPE_CHECKING

from fastapi import Request

if TYPE_CHECKING:
    from claimit_mongodb_models import MongoDBClient

_RATE_LIMIT_WINDOW_SECONDS = 300
_RATE_LIMIT_MAX_SUBMISSIONS = 1
_ip_submission_log: dict[str, deque[float]] = defaultdict(deque)

_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def get_client_ip(request: Request) -> str:
    """Extract client IP, preferring X-Forwarded-For first hop."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def is_honeypot_triggered(honeypot_value: str | None) -> bool:
    """True if the honeypot field was filled."""
    return bool(honeypot_value and honeypot_value.strip())


def is_valid_email(email: str) -> bool:
    """Regex email format check aligned with careers validation."""
    return bool(_EMAIL_PATTERN.match((email or "").strip()))


def normalize_email(email: str) -> str:
    """Normalize email for storage and dedup queries."""
    return email.strip().lower()


def check_ip_rate_limit(client_ip: str) -> bool:
    """Return True if allowed; record the attempt when allowed."""
    now = time()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    log = _ip_submission_log[client_ip]
    while log and log[0] < window_start:
        log.popleft()
    if len(log) >= _RATE_LIMIT_MAX_SUBMISSIONS:
        return False
    log.append(now)
    return True


async def check_email_dedup(
    db: MongoDBClient,
    collection_name: str,
    email: str,
    max_per_day: int = 3,
    timestamp_field: str = "submitted_at",
) -> bool:
    """Return True if email is under the daily limit for this collection."""
    day_ago = datetime.now(UTC) - timedelta(days=1)
    count = await db.count(
        collection_name,
        {timestamp_field: {"$gte": day_ago}, "email": normalize_email(email)},
    )
    return count < max_per_day


def validate_email_or_raise(
    email: str,
    *,
    raise_error: Callable[[str, str, int], None],
) -> str:
    """Normalize email or invoke raise_error(code, message, status_code)."""
    normalized = normalize_email(email)
    if not is_valid_email(normalized):
        raise_error("validation_error", "Please enter a valid email address.", 400)
    return normalized
