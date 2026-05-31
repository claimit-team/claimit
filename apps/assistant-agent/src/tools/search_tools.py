"""Elastic search tools for the Assistant Agent (off-hot-path adapter bridge).

These are ADK FunctionTools that wrap the shared SearchAdapter directly. NOTE:
the assistant's runtime policy search now goes through **Elastic Agent Builder
MCP** (`claimit_mcp.call_elastic_mcp_tool`, see agent.py `search_policies_fulltext`
and mode_a.py), so `search_policies` here is no longer the agent's policy path.
This module is retained for (a) non-MCP `SearchAdapter` consumers and (b)
`search_user_purchases`, the closure-scoped per-user purchase search used by
mode_a's local `handle_message` path (per-user purchase search is intentionally
NOT exposed over Elastic MCP — it would need a session-driven user_id baked into
the Kibana tool, never an LLM-fillable arg).

The adapter is constructed and closed inside each tool call rather than held
on the agent. Tools are cloudpickled when deployed to Vertex AI Agent
Engines; holding a live HTTP client on the module would either fail to
pickle or smuggle a stale connection into the deployed bundle.

Error handling contract (BUG-31, BUG-61):

- Every adapter call is wrapped in `asyncio.wait_for(..., timeout=8s)` so a
  wedged ES node can never block the tool indefinitely.
- Transient failures (ConnectionTimeout, ConnectionError, TransportError,
  5xx ApiError, asyncio.TimeoutError) trigger a single 200ms-backed retry.
- 4xx ApiError subclasses (AuthenticationException, AuthorizationException,
  BadRequestError, NotFoundError, ConflictError) are not retried — they
  indicate a configuration or query bug and retrying will just re-fail.
- On final failure the tool returns a structured error dict rather than
  raising. The LLM can then say "Search is temporarily slow, please try
  again" instead of hallucinating an answer (the BUG-31 user-visible symptom
  was the model saying "couldn't find Best Buy's policy" when ES blipped).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

# Upper bounds on result-set size. The model can ask for any limit it wants
# but we silently clamp to keep prompt context tractable. Negative or zero
# limits are rejected loudly — that's always a coding bug in the agent prompt,
# never a legitimate query.
MAX_POLICY_LIMIT = 20
MAX_PURCHASE_LIMIT = 50

# Per-attempt timeout. Two attempts + backoff fits comfortably in the
# ~20s LLM tool-call budget while leaving headroom for the model to react.
_TOOL_TIMEOUT_SECONDS = 8.0
_RETRY_BACKOFF_SECONDS = 0.2
_MAX_ATTEMPTS = 2

_STRUCTURED_ERROR: dict[str, str] = {
    "error": "search_unavailable",
    "message": "Policy search is temporarily slow, please try again.",
}


def _is_transient(exc: BaseException) -> bool:
    """Classify ES exceptions for retry decisions.

    elastic-transport raises ConnectionTimeout / ConnectionError /
    TransportError for network-layer blips. The elasticsearch package
    raises ApiError subclasses with HTTP status — 5xx means the cluster
    is unhappy (retry), 4xx means we sent a bad request (do not retry).

    asyncio.TimeoutError comes from our own wait_for and is always
    transient by definition — the call was still in flight when we gave up.
    """
    if isinstance(exc, asyncio.TimeoutError):
        return True

    # Import here so this module doesn't drag elasticsearch into its
    # import graph at definition time (matches the lazy `from search ...`
    # pattern used in each tool body).
    try:
        from elastic_transport import ApiError, TransportError
    except ImportError:
        return False

    if isinstance(exc, ApiError):
        status = getattr(getattr(exc, "meta", None), "status", None)
        return isinstance(status, int) and status >= 500
    # TransportError covers ConnectionTimeout, ConnectionError, TlsError,
    # SerializationError — all transport-level and worth one retry.
    return isinstance(exc, TransportError)


async def _call_with_retry(
    tool_name: str,
    log_ctx: dict[str, Any],
    coro_factory: Callable[[], Awaitable[Any]],
) -> Any:
    """Run `coro_factory()` with per-attempt timeout + one transient retry.

    Returns the awaited value on success, or the shared _STRUCTURED_ERROR
    dict on final failure. The caller decides what to do with that dict
    (search tools surface it to the LLM directly).

    `coro_factory` is a zero-arg callable that returns a fresh coroutine
    each call — needed because a coroutine can only be awaited once, and
    we may need a second one for the retry attempt.
    """
    start = time.monotonic()
    logger.info("%s start %s", tool_name, log_ctx)
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            result = await asyncio.wait_for(coro_factory(), timeout=_TOOL_TIMEOUT_SECONDS)
        except Exception as exc:
            last_exc = exc
            elapsed_ms = int((time.monotonic() - start) * 1000)
            transient = _is_transient(exc)
            logger.warning(
                "%s attempt=%d failed transient=%s exc=%s elapsed_ms=%d ctx=%s",
                tool_name,
                attempt,
                transient,
                type(exc).__name__,
                elapsed_ms,
                log_ctx,
            )
            if not transient or attempt >= _MAX_ATTEMPTS:
                break
            await asyncio.sleep(_RETRY_BACKOFF_SECONDS)
            continue
        else:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            count = len(result) if hasattr(result, "__len__") else None
            logger.info(
                "%s ok attempts=%d count=%s elapsed_ms=%d ctx=%s",
                tool_name,
                attempt,
                count,
                elapsed_ms,
                log_ctx,
            )
            return result

    elapsed_ms = int((time.monotonic() - start) * 1000)
    logger.error(
        "%s failed final exc=%s elapsed_ms=%d ctx=%s",
        tool_name,
        type(last_exc).__name__ if last_exc else "unknown",
        elapsed_ms,
        log_ctx,
    )
    return dict(_STRUCTURED_ERROR)


async def search_policies(query: str, limit: int = 5) -> list[dict[str, Any]] | dict[str, Any]:
    """Search platform price-protection policies by keyword.

    Use this when the user asks about a specific platform's policy,
    exclusions, claim windows, or claim methods.

    Examples:
        "What is Best Buy's return window?"
        "Does Hilton require loyalty membership?"

    Args:
        query: Search keywords (e.g. "Best Buy exclusions", "hotel 24 hour window").
        limit: Maximum results to return. Defaults to 5.

    Returns:
        On success: a list of matching policy documents (each is a dict of
        policy fields). On transport failure: a structured error dict
        `{"error": "search_unavailable", "message": "..."}` — the LLM
        should tell the user the search is temporarily slow rather than
        guessing at policy content.
    """
    if limit < 1:
        raise ValueError("limit must be >= 1")
    limit = min(limit, MAX_POLICY_LIMIT)

    from search import get_search_adapter

    adapter = get_search_adapter()
    try:
        return await _call_with_retry(
            "search_policies",
            {"query": query, "limit": limit},
            lambda: adapter.search_policies(query=query, limit=limit),
        )
    finally:
        await adapter.close()


async def search_user_purchases(
    user_id: str, query: str, limit: int = 10
) -> list[dict[str, Any]] | dict[str, Any]:
    """Search a user's purchases by keyword (natural language).

    Use this when the user asks about a specific purchase using natural
    language rather than exact filters.

    Examples:
        "my Best Buy headphones order"
        "recent hotel bookings"

    Args:
        user_id: The authenticated user's ID — scopes the search to that user.
        query: Natural language query (e.g. "Sony headphones", "Hilton booking").
        limit: Maximum results. Defaults to 10.

    Returns:
        On success: a list of matching purchase documents. On transport
        failure: a structured error dict — see search_policies.
    """
    if limit < 1:
        raise ValueError("limit must be >= 1")
    limit = min(limit, MAX_PURCHASE_LIMIT)

    from search import get_search_adapter

    adapter = get_search_adapter()
    try:
        return await _call_with_retry(
            "search_user_purchases",
            {"user_id": user_id, "query": query, "limit": limit},
            lambda: adapter.search_purchases(user_id=user_id, query=query, limit=limit),
        )
    finally:
        await adapter.close()
