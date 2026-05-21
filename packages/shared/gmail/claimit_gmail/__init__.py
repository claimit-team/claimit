"""ClaimIt shared Gmail helpers.

Public surface:

- `register_watch_or_raise(user_id, db, sm_client)` — register a Gmail push
  watch and persist the cursor on success. Raises `WatchRegistrationError`
  on any terminal failure (4xx, exhausted 5xx retries, missing refresh
  token, malformed Gmail response, etc.). Useful for callers that want to
  count or react to per-call outcomes (e.g., the 4.16 renewal sweep).

- `register_watch_safe(user_id, db, sm_client)` — same as `_or_raise` but
  catches everything and persists `watch_failed=True` + error message to
  the user document. Never raises. Useful for fire-and-forget callers
  with no error channel (e.g., the OAuth-callback BackgroundTask in
  api-gateway, which would otherwise lose the exception entirely).

- `WatchRegistrationError` — the typed exception raised by `_or_raise`.
  Carries a `terminal_message` attribute that's safe to render in the
  user-facing settings UI.
"""

from .watch import WatchRegistrationError, register_watch_or_raise, register_watch_safe

__all__ = [
    "WatchRegistrationError",
    "register_watch_or_raise",
    "register_watch_safe",
]
