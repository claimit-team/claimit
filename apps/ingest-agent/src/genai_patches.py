"""Defensive monkey-patches for the google-genai client.

Background — google-genai `BaseApiClient.aclose()` is unsafe during
garbage collection when running on the Vertex async-auth path: that
path leaves `_async_httpx_client = None` (the live API calls go
through `_aiohttp_session` instead), but `aclose()` unconditionally
calls `await self._async_httpx_client.aclose()` which raises
`AttributeError: 'BaseApiClient' object has no attribute
'_async_httpx_client'` on every cleanup. The upstream fix is PR
googleapis/python-genai#2243 — open since April 2026, still awaiting
upstream merge (https://github.com/googleapis/python-genai/pull/2243).

Until it ships, we apply the same defensive-getattr fix at runtime
here. The patch is a strict superset of what 2243 introduces: every
attribute that might not exist on a partially-destroyed object is
guarded with `getattr(self, ..., None)`, matching the pre-existing
defensive pattern in `BaseApiClient.close()`.

Why monkey-patch instead of forking google-genai or pinning to a
known-good version:
  - There is NO released version with the fix; 2243 has not merged.
  - Forking the SDK doubles the surface ADK / Vertex changes have
    to track, for one short defensive function.
  - Patching is observable (logger.info on import) and self-removing
    once the upstream fix ships — `_PATCH_APPLIED` keeps it
    idempotent so a re-import is a no-op.

This patch fixes the SYMPTOM (the AttributeError surfacing out of
`runner.run_async` after a successful extraction). It is NOT a
behaviour change — `_async_httpx_client.aclose()` was already a
no-op on the Vertex async-auth path because the attribute is None;
the bug is purely that None has no `.aclose`. After this patch:
  - Vertex async-auth path: nothing to close on the httpx side, so
    we skip; the aiohttp session is closed if it exists. Same as
    pre-patch behaviour minus the crash.
  - Vertex/Gemini sync-httpx path: `_async_httpx_client` is a real
    AsyncHttpxClient → we still close it.
  - User-supplied `http_options.httpx_async_client`: we still skip
    (caller owns the lifecycle), same as upstream.

Sanity test: `tests/test_genai_patches.py` constructs a stub
mimicking the broken Vertex shape (`_async_httpx_client=None`,
`_http_options` with `httpx_async_client=None`) and asserts the
patched `aclose` completes without raising. The test is independent
of installed google-genai version so future upgrades don't silently
revert the protection.
"""

from __future__ import annotations

import contextlib
import logging
from typing import Any

logger = logging.getLogger(__name__)

_PATCH_APPLIED = False


async def _patched_aclose(self: Any) -> None:
    """Drop-in replacement for `BaseApiClient.aclose()` that survives partial GC.

    Mirrors the change in googleapis/python-genai#2243: every attribute
    access goes through `getattr(self, name, None)` so a partially
    finalized object (where `__del__` ran on a sibling attribute and
    cleared it) cannot raise AttributeError out of the cleanup task.
    """
    http_options = getattr(self, "_http_options", None)
    async_httpx_client = getattr(self, "_async_httpx_client", None)
    aiohttp_session = getattr(self, "_aiohttp_session", None)

    # `httpx_async_client` on http_options indicates the caller passed
    # in their own client and is responsible for its lifecycle. Same
    # opt-out shape as the upstream code; respect it even after GC.
    user_owned_httpx = bool(http_options and getattr(http_options, "httpx_async_client", None))
    if async_httpx_client is not None and not user_owned_httpx:
        # Swallow any inner exception — we're already running inside a
        # __del__-scheduled task; raising here would just become the
        # same unhandled-asyncio-task-exception surface the patch
        # exists to eliminate. Teardown failures aren't actionable
        # from this layer.
        with contextlib.suppress(Exception):
            await async_httpx_client.aclose()

    user_owned_aiohttp = bool(http_options and getattr(http_options, "aiohttp_client", None))
    if aiohttp_session is not None and not user_owned_aiohttp:
        with contextlib.suppress(Exception):
            await aiohttp_session.close()


def apply_patches() -> None:
    """Install the defensive `aclose` patch on `google.genai._api_client.BaseApiClient`.

    Idempotent: a second call is a no-op (the in-process flag avoids
    re-wrapping if e.g. the FastAPI lifespan runs multiple times in
    tests). Logs once on install so a Cloud Logging tail can confirm
    the patch is live in a fresh revision.

    Raises nothing — if google.genai isn't importable, we log a
    warning and return; the caller (extractor.py module import) must
    not crash on an environment without google-genai installed.
    """
    global _PATCH_APPLIED
    if _PATCH_APPLIED:
        return

    try:
        from google.genai import _api_client  # type: ignore[import-not-found]
    except Exception as exc:
        logger.warning("genai_patches: google.genai not importable; skipping patch (%s)", exc)
        return

    base_cls = getattr(_api_client, "BaseApiClient", None)
    if base_cls is None:
        logger.warning("genai_patches: BaseApiClient symbol not found; skipping patch")
        return

    base_cls.aclose = _patched_aclose
    _PATCH_APPLIED = True
    logger.info(
        "genai_patches: applied defensive aclose patch for "
        "google.genai._api_client.BaseApiClient (workaround for upstream PR #2243)"
    )
