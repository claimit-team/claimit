"""In-process Gmail access-token cache (ticket 4.14).

Trades a small refresh-token-exchange cost for per-instance memory. Cloud Run
runs >=1 instance concurrently, so each instance has its own cache; the worst
case is each instance making one refresh call before the cached token is hot.
That's acceptable for the hackathon scope (we have <10 active users) and
matches the spec's design decision.

Thread-safety: FastAPI dispatches async coroutines on a single event loop per
worker, so RLock contention is rare. We use RLock rather than Lock to allow
nested get() calls from refactored paths without self-deadlock.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

# Re-authenticate slightly before the token actually expires so a slow request
# in flight isn't suddenly told 401 mid-call.
_EXPIRY_SKEW_SECONDS = 30


@dataclass
class CachedToken:
    access_token: str
    expires_at: float  # epoch seconds


class AccessTokenCache:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._store: dict[str, CachedToken] = {}

    def get(self, user_id: str) -> str | None:
        """Return a cached token if present and >30s from expiry; else None."""
        with self._lock:
            entry = self._store.get(user_id)
            if entry is None:
                return None
            if entry.expires_at - time.time() < _EXPIRY_SKEW_SECONDS:
                self._store.pop(user_id, None)
                return None
            return entry.access_token

    def set(self, user_id: str, access_token: str, expires_at: float) -> None:
        with self._lock:
            self._store[user_id] = CachedToken(access_token=access_token, expires_at=expires_at)

    def invalidate(self, user_id: str) -> None:
        with self._lock:
            self._store.pop(user_id, None)
