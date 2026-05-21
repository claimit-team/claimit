"""Tests for the defensive google-genai BaseApiClient.aclose patch.

The patch is the root-cause fix (commit 2b) for the prod symptom
where `runner.run_async(...)` raised `AttributeError: 'BaseApiClient'
object has no attribute '_async_httpx_client'` after a successful
extraction completed. Tests cover the three shapes a partially-
finalized BaseApiClient instance can have so a future upstream
upgrade that quietly drops a different attribute doesn't silently
revert protection.

These tests EXERCISE the actual patched method off the real
`google.genai._api_client.BaseApiClient` class (since
`extractor.py` import triggers `apply_patches()` and ADK / genai is
installed in dev). The stub `_FakeHttpOptions` and the manually
constructed instance via `object.__new__` mirror exactly the field
shapes the real client carries on the Vertex async-auth path —
the only path the prod failure was observed on.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

# Importing extractor runs `apply_patches()` as a side effect — this
# is the actual install point in production code, so the test
# exercises the same wiring (not just `genai_patches.apply_patches()`
# in isolation). The `noqa: F401` keeps the import; we use the side
# effect, not the symbol.
from src import extractor, genai_patches  # noqa: F401


class _FakeHttpOptions:
    """Mirrors the relevant fields on google.genai.types.HttpOptions.

    Only the two attributes `aclose()` reaches for matter: a non-None
    value on either indicates the CALLER provided that client and we
    must not close it. None means library-created → safe to close.
    """

    def __init__(
        self,
        *,
        httpx_async_client: Any = None,
        aiohttp_client: Any = None,
    ) -> None:
        self.httpx_async_client = httpx_async_client
        self.aiohttp_client = aiohttp_client


def _new_base_client_like(**attrs: Any):
    """Construct an unbound BaseApiClient instance with explicit attrs.

    `object.__new__` skips `BaseApiClient.__init__` (which would try
    to authenticate against Vertex) and lets us set exactly the
    attribute shape the broken path exhibits. The class identity is
    preserved so the patched `aclose` bound method dispatches to our
    instance.
    """
    from google.genai._api_client import BaseApiClient  # type: ignore[import-not-found]

    instance = object.__new__(BaseApiClient)
    for name, value in attrs.items():
        setattr(instance, name, value)
    return instance


def test_aclose_survives_none_async_httpx_client() -> None:
    """The exact Vertex async-auth shape that crashes pre-patch.

    `_async_httpx_client = None` because the auth path uses aiohttp
    instead. Pre-patch this raised `AttributeError: 'NoneType' object
    has no attribute 'aclose'` (which propagated as the
    "object has no attribute '_async_httpx_client'" surface the prod
    logs show). The patched aclose must complete silently.
    """
    instance = _new_base_client_like(
        _http_options=_FakeHttpOptions(),
        _async_httpx_client=None,
        _aiohttp_session=None,
    )
    asyncio.run(instance.aclose())  # must not raise


def test_aclose_closes_library_owned_httpx_client() -> None:
    """Library-created httpx client (sync httpx auth path) IS closed."""
    fake_client = AsyncMock()
    instance = _new_base_client_like(
        _http_options=_FakeHttpOptions(httpx_async_client=None),
        _async_httpx_client=fake_client,
        _aiohttp_session=None,
    )
    asyncio.run(instance.aclose())
    fake_client.aclose.assert_awaited_once()


def test_aclose_respects_user_owned_httpx_client() -> None:
    """Caller-provided httpx client (http_options.httpx_async_client set) is NOT closed.

    Same opt-out the upstream code respects. The patch must preserve
    it so a future caller that injects a long-lived shared client
    doesn't get it torn out from under them by a finalize on one
    ADK Runner.
    """
    user_client = object()  # any truthy marker
    library_client = AsyncMock()
    instance = _new_base_client_like(
        _http_options=_FakeHttpOptions(httpx_async_client=user_client),
        _async_httpx_client=library_client,
        _aiohttp_session=None,
    )
    asyncio.run(instance.aclose())
    library_client.aclose.assert_not_awaited()


def test_aclose_closes_aiohttp_session_when_present() -> None:
    fake_session = AsyncMock()
    instance = _new_base_client_like(
        _http_options=_FakeHttpOptions(),
        _async_httpx_client=None,
        _aiohttp_session=fake_session,
    )
    asyncio.run(instance.aclose())
    fake_session.close.assert_awaited_once()


def test_aclose_survives_missing_http_options_entirely() -> None:
    """A really aggressive GC may have already cleared _http_options.

    The upstream PR specifically calls this out — `getattr(self,
    '_http_options', None)` returning None must not crash. Test the
    extreme case to pin the defensive contract.
    """
    instance = _new_base_client_like()  # no attributes set at all
    asyncio.run(instance.aclose())  # must not raise


def test_aclose_swallows_inner_exceptions() -> None:
    """An exception inside the inner client's aclose must not surface.

    If we're already in a __del__-scheduled task, raising would
    re-introduce the unhandled-task-exception surface the patch
    exists to prevent. The catch is intentional — there's no caller
    above us who can handle a teardown failure meaningfully.
    """
    fake_client = AsyncMock()
    fake_client.aclose.side_effect = RuntimeError("boom")
    instance = _new_base_client_like(
        _http_options=_FakeHttpOptions(),
        _async_httpx_client=fake_client,
        _aiohttp_session=None,
    )
    asyncio.run(instance.aclose())  # no exception leaks


def test_apply_patches_is_idempotent() -> None:
    """Second call must be a no-op so multiple lifespan starts are safe.

    The import-time application is the contract; this test just
    confirms a manual second call observes the in-process flag and
    returns. (Bypass-test the state by saving + restoring the flag.)
    """
    saved = genai_patches._PATCH_APPLIED
    try:
        # Pre-condition: by importing src.extractor we already applied
        # the patch, so the flag is True. Calling again should no-op
        # without touching the symbol.
        assert genai_patches._PATCH_APPLIED is True
        genai_patches.apply_patches()  # second call
        assert genai_patches._PATCH_APPLIED is True
    finally:
        genai_patches._PATCH_APPLIED = saved
