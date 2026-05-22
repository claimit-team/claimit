"""Tests for claimit_mcp.auth.GoogleIDTokenAuth (ticket 5.10).

Covers the public httpx.Auth contract:
- Bearer header injection on every emitted request
- Token caching: cached value reused within the refresh-cushion window
- Refresh after the cushion expires (clock-mocked, no real wait)
- Empty-audience constructor guard
- Concurrent-call deduplication via the double-checked-locking refresh
  (5 threads racing the first request should produce exactly one
  metadata-server fetch)

`google.oauth2.id_token.fetch_id_token` is the only outbound call this
module makes; we mock it via `unittest.mock.patch` at its bound symbol
on `claimit_mcp.auth.id_token` (the local import is what the module's
code actually reaches at runtime).

No real HTTP is exercised — the auth flow is a pure generator that
transforms `httpx.Request` objects, so synthetic Requests are enough.
"""

from __future__ import annotations

import threading
import time
from unittest.mock import patch

import httpx
import pytest
from claimit_mcp.auth import (
    _REFRESH_CUSHION_SECONDS,
    _TOKEN_LIFETIME_SECONDS,
    GoogleIDTokenAuth,
)

_AUDIENCE = "https://claimit-mongodb-mcp-readonly.example.run.app"


def _drive_auth_flow(auth: GoogleIDTokenAuth) -> httpx.Request:
    """Run one request through `sync_auth_flow` and return the request
    after header mutation. Mirrors how httpx itself drives the
    generator: send None to start, expect the modified Request, then
    close the generator."""
    request = httpx.Request("POST", "https://target.example/mcp")
    flow = auth.sync_auth_flow(request)
    yielded = next(flow)
    flow.close()
    return yielded


# ---------------------------------------------------------------------------
# Constructor
# ---------------------------------------------------------------------------


def test_empty_audience_raises_value_error() -> None:
    """Empty string is the most common typo for a missing config; reject
    at construction so the failure surfaces early (at deploy_agents.py
    module-load time, not on the first agent invocation 30 minutes later)."""
    with pytest.raises(ValueError, match="non-empty audience"):
        GoogleIDTokenAuth(audience="")


# ---------------------------------------------------------------------------
# Bearer header injection
# ---------------------------------------------------------------------------


def test_sync_auth_flow_sets_bearer_header() -> None:
    """The mocked `fetch_id_token` returns a sentinel; the auth flow
    should attach it as a Bearer header on the outgoing Request."""
    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    with patch("claimit_mcp.auth.id_token.fetch_id_token", return_value="sentinel-tok"):
        request = _drive_auth_flow(auth)
    assert request.headers["Authorization"] == "Bearer sentinel-tok"


def test_fetch_id_token_called_with_audience() -> None:
    """Pin the audience claim — Cloud Run's run.invoker check matches
    on this exact string against the configured service URL."""
    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    with patch("claimit_mcp.auth.id_token.fetch_id_token", return_value="t") as mock_fetch:
        _drive_auth_flow(auth)
    mock_fetch.assert_called_once()
    _request_arg, audience_arg = mock_fetch.call_args.args
    assert audience_arg == _AUDIENCE


# ---------------------------------------------------------------------------
# Caching + refresh
# ---------------------------------------------------------------------------


def test_token_cached_within_refresh_cushion() -> None:
    """Two consecutive requests inside the cushion window should use the
    cached token — only one fetch_id_token call total."""
    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    with patch("claimit_mcp.auth.id_token.fetch_id_token", return_value="cached-tok") as mock_fetch:
        first = _drive_auth_flow(auth)
        second = _drive_auth_flow(auth)
    assert first.headers["Authorization"] == "Bearer cached-tok"
    assert second.headers["Authorization"] == "Bearer cached-tok"
    assert mock_fetch.call_count == 1


def test_token_refreshes_after_cushion_expires() -> None:
    """Mock the clock past the (expires_at - cushion) boundary and verify
    the second request triggers a fresh fetch."""
    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    fake_now = [1_000_000.0]  # mutable wrapper

    def fake_time() -> float:
        return fake_now[0]

    with (
        patch(
            "claimit_mcp.auth.id_token.fetch_id_token",
            side_effect=["tok-1", "tok-2"],
        ) as mock_fetch,
        patch("claimit_mcp.auth.time.time", side_effect=fake_time),
    ):
        first = _drive_auth_flow(auth)
        assert first.headers["Authorization"] == "Bearer tok-1"

        # Advance the clock to JUST INSIDE the cushion window — still
        # cached.
        fake_now[0] += _TOKEN_LIFETIME_SECONDS - _REFRESH_CUSHION_SECONDS - 10
        cached = _drive_auth_flow(auth)
        assert cached.headers["Authorization"] == "Bearer tok-1"
        assert mock_fetch.call_count == 1

        # Advance past the cushion boundary — should refresh.
        fake_now[0] += 20  # crosses the (expires_at - cushion) threshold
        refreshed = _drive_auth_flow(auth)
        assert refreshed.headers["Authorization"] == "Bearer tok-2"
        assert mock_fetch.call_count == 2


def test_token_refresh_when_initially_empty() -> None:
    """Brand-new instance with no cached token → first call triggers
    fetch immediately. Pins the `_token is None` branch of
    `_token_needs_refresh`."""
    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    with patch("claimit_mcp.auth.id_token.fetch_id_token", return_value="new-tok") as mock_fetch:
        _drive_auth_flow(auth)
    assert mock_fetch.call_count == 1


# ---------------------------------------------------------------------------
# Thread-safe refresh
# ---------------------------------------------------------------------------


def test_concurrent_refresh_dedupes_to_single_fetch() -> None:
    """5 threads racing the first request should produce exactly one
    `fetch_id_token` call — the double-checked locking in `_refresh`
    means waiters past the first see the freshly-minted token and skip
    their own fetch.

    To force the race, the mocked fetch sleeps briefly so the first
    thread is still "in flight" when threads 2-5 arrive at the lock.
    Without the sleep, thread 1 might complete + update the cache
    before any other thread starts, and the test wouldn't actually
    exercise the contended path."""
    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    fetch_call_count = [0]
    fetch_lock = threading.Lock()

    def slow_fetch(_request, _audience: str) -> str:
        # Hold the call open long enough that the other 4 threads
        # contend on the auth's own lock before this returns.
        with fetch_lock:
            fetch_call_count[0] += 1
        time.sleep(0.05)
        return "shared-tok"

    tokens_seen: list[str] = []
    tokens_lock = threading.Lock()

    def worker() -> None:
        with patch("claimit_mcp.auth.id_token.fetch_id_token", side_effect=slow_fetch):
            request = _drive_auth_flow(auth)
        with tokens_lock:
            tokens_seen.append(request.headers["Authorization"])

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # All 5 threads received the same Bearer token...
    assert len(tokens_seen) == 5
    assert all(h == "Bearer shared-tok" for h in tokens_seen)
    # ...but fetch_id_token was called exactly once (deduplicated).
    assert fetch_call_count[0] == 1


# ---------------------------------------------------------------------------
# Pickle safety (Agent Engine deploy path)
# ---------------------------------------------------------------------------


def test_auth_is_cloudpickle_safe_for_agent_engine_deploy() -> None:
    """Regression: ADK's deploy path cloudpickles the whole McpToolset,
    which reaches this auth instance through the httpx_client_factory
    closure. A live threading.Lock attribute used to break that with
    "cannot pickle '_thread.lock' object" — see the hotfix that
    moved the lock behind _get_lock + __getstate__/__setstate__."""
    import cloudpickle

    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    # Force the cached-token branch to exercise non-default state too.
    auth._token = "stub-token"
    auth._expires_at = 9_999_999_999.0
    # Touch the lock so the live instance has one; the round-trip must
    # still strip it without complaining.
    auth._get_lock()

    restored = cloudpickle.loads(cloudpickle.dumps(auth))

    assert restored._audience == _AUDIENCE
    assert restored._token == "stub-token"
    assert restored._expires_at == 9_999_999_999.0
    # Lock must work on the restored instance — lazy recreation, not a no-op.
    with restored._get_lock():
        pass


def test_get_lock_returns_same_instance_under_concurrent_first_calls() -> None:
    """Regression: prevents 'two threads → two different Lock instances'
    race in _get_lock. Concurrent first-callers must all get the same
    Lock so _refresh actually serializes — a read-then-write pattern
    would let the second writer clobber the first, leaving different
    threads holding different locks. dict.setdefault is atomic under
    CPython's GIL and closes that gap.

    The Barrier forces all 8 threads to release simultaneously, so they
    all enter _get_lock before any one of them returns — the contended
    path is what the test is verifying."""
    auth = GoogleIDTokenAuth(audience=_AUDIENCE)
    locks: list[threading.Lock] = []
    locks_lock = threading.Lock()
    barrier = threading.Barrier(8)

    def collect() -> None:
        barrier.wait()  # release all 8 threads simultaneously
        lock = auth._get_lock()
        with locks_lock:
            locks.append(lock)

    threads = [threading.Thread(target=collect) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(locks) == 8
    # All 8 threads must have gotten the same Lock instance.
    assert all(lock is locks[0] for lock in locks)
    assert len({id(lock) for lock in locks}) == 1
