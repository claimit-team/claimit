"""OIDC ID-token auth for HTTP-transport MCP servers (ticket 5.10).

The MongoDB MCP Cloud Run service is gated by `roles/run.invoker`. Every
HTTP request from the ADK agent (running in Vertex AI Agent Engine or a
Cloud Run agent service) must carry a Google-issued OIDC ID token in
`Authorization: Bearer <token>`, scoped to the audience of the target
Cloud Run service URL.

`GoogleIDTokenAuth` is an `httpx.Auth` subclass that does this
automatically and caches the token across requests, refreshing before
it expires. ADK accepts an `httpx_client_factory` on both
`SseConnectionParams` and `StreamableHTTPConnectionParams`; we pass a
factory that returns an `httpx.AsyncClient(auth=GoogleIDTokenAuth(audience))`.

Why an in-house implementation rather than `google-auth-httpx2`:
- That package is third-party and narrowly scoped.
- The mechanical part is ~30 lines.
- We control the refresh-cushion policy (5 min before expiry — see
  `_REFRESH_CUSHION_SECONDS` below) and the token lifetime assumption
  (1h, the documented Google ID-token TTL).

Why fetch ID tokens via `google.oauth2.id_token.fetch_id_token`:
- On Cloud Run + Agent Engine, ADC resolves to the runtime service
  account. `fetch_id_token` hits the metadata server, which mints a
  token signed AS that SA with the requested audience claim. No
  service-account-key handling, no impersonation.
- Same pattern documented by GCP for Cloud-Run-to-Cloud-Run calls
  (https://cloud.google.com/run/docs/authenticating/service-to-service).
"""

from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING

import google.auth.transport.requests
import httpx
from google.oauth2 import id_token

if TYPE_CHECKING:
    from collections.abc import Generator

# Google-issued OIDC ID tokens last 3600s. Refresh 300s before expiry so
# a token in flight at the cutoff still has 5 minutes of validity —
# avoids a race where the server clock + a small network delay land the
# token just past expiry on the receiving side. 5 min is a healthy
# cushion for the demo; under sustained load we could tighten to 60s
# without changing correctness.
_TOKEN_LIFETIME_SECONDS = 3600
_REFRESH_CUSHION_SECONDS = 300


class GoogleIDTokenAuth(httpx.Auth):
    """`httpx.Auth` that injects a fresh Google OIDC ID token on every request.

    `audience` should be the Cloud Run service URL the request targets,
    WITHOUT a path component — OIDC convention is for the audience to
    match the origin, not the specific endpoint. For the MongoDB MCP
    service the audience is the bare service URL
    (e.g. `https://claimit-mongodb-mcp-readonly-...run.app`); the
    Streamable HTTP endpoint suffix (`/mcp`) is appended by the caller
    when constructing the `StreamableHTTPConnectionParams.url`.

    Thread-safe: a single lock guards the cached token + expiry timestamp
    so concurrent requests don't all kick off duplicate metadata-server
    fetches under load. The lock is contended only when refreshing —
    happy-path requests just read the cached values.

    Pickle-safe: the lock is created lazily in `_get_lock` (rather than
    eagerly in `__init__`) and stripped in `__getstate__`. ADK's Agent
    Engine deploy path cloudpickles the whole toolset, including this
    auth instance via the `httpx_client_factory` closure, and a live
    `threading.Lock` would fail with "cannot pickle '_thread.lock' object".
    """

    def __init__(self, audience: str) -> None:
        if not audience:
            raise ValueError("GoogleIDTokenAuth requires a non-empty audience")
        self._audience = audience
        self._token: str | None = None
        self._expires_at: float = 0.0
        # _lock is built lazily by _get_lock so __init__ stays cloudpickle-safe.

    def _get_lock(self) -> threading.Lock:
        # Created on first use so __init__ stays pickle-safe. After a
        # pickle round-trip _lock is absent from __dict__ (see
        # __getstate__) and this re-creates it on the restored instance.
        lock = getattr(self, "_lock", None)
        if lock is None:
            lock = threading.Lock()
            self._lock = lock
        return lock

    def __getstate__(self) -> dict:
        # Strip the unpicklable Lock; everything else (audience, cached
        # token, expiry) is plain data and round-trips cleanly.
        state = self.__dict__.copy()
        state.pop("_lock", None)
        return state

    def __setstate__(self, state: dict) -> None:
        self.__dict__.update(state)
        # _lock left absent on purpose; _get_lock() recreates it lazily.

    def _token_needs_refresh(self) -> bool:
        # Refresh when there's no token at all OR the existing token will
        # expire within the cushion window. `now()` against a unix epoch
        # is fine here — we don't need sub-second precision.
        return self._token is None or time.time() > self._expires_at - _REFRESH_CUSHION_SECONDS

    def _refresh(self) -> str:
        # Double-checked locking: a waiter that grabbed the lock after a
        # previous refresher already wrote the new token doesn't need to
        # hit the metadata server again.
        with self._get_lock():
            if not self._token_needs_refresh():
                # Cast for the type checker — we just confirmed it's not None.
                assert self._token is not None
                return self._token
            request = google.auth.transport.requests.Request()
            new_token = id_token.fetch_id_token(request, self._audience)
            self._token = new_token
            self._expires_at = time.time() + _TOKEN_LIFETIME_SECONDS
            return new_token

    def _bearer(self) -> str:
        if self._token_needs_refresh():
            return self._refresh()
        # Cached path: no lock — the worst that happens under a race is
        # a benign extra refresh in `_refresh` itself.
        assert self._token is not None  # _token_needs_refresh() guarantees this
        return self._token

    def sync_auth_flow(
        self, request: httpx.Request
    ) -> Generator[httpx.Request, httpx.Response, None]:
        request.headers["Authorization"] = f"Bearer {self._bearer()}"
        yield request

    # httpx.Auth's async path defaults to dispatching `sync_auth_flow` in
    # a threadpool when `async_auth_flow` isn't overridden. The fetch is
    # itself a sync call to the metadata server (urllib under the hood),
    # so reusing sync_auth_flow keeps the implementation small. If the
    # threadpool dispatch becomes a contention point under real load,
    # we can override async_auth_flow to await an async metadata
    # client — not worth the complexity yet.
