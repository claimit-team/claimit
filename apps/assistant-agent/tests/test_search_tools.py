"""Unit tests for tools/search_tools.py.

Mocks `search.get_search_adapter` (the lazy import inside each tool) so
tests do not require Elasticsearch / Atlas Search connectivity.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from elastic_transport import ApiError, ConnectionTimeout
from elasticsearch import AuthenticationException
from src.tools.search_tools import search_policies, search_user_purchases


def _make_api_error(status: int, cls: type[ApiError] = ApiError) -> ApiError:
    """Build an ApiError carrying just enough metadata for the classifier.

    The shipped constructor demands full ApiResponseMeta + HttpHeaders +
    NodeConfig, none of which our classifier reads — it only inspects
    `isinstance(exc, ApiError)` and `exc.meta.status`. Bypassing __init__
    via `__new__` keeps the test free of irrelevant Elastic plumbing and
    is stable across elasticsearch-py 8.x patch releases (ApiError is not
    __slots__-ed; the four attributes set below mirror the real __init__)."""
    exc = cls.__new__(cls)
    exc.message = f"synthetic {status}"
    exc.meta = SimpleNamespace(status=status)
    exc.body = None
    exc.errors = ()
    return exc


def _make_adapter_mock(return_value: list[dict[str, object]]) -> MagicMock:
    """Build an adapter whose async methods all return `return_value`."""
    adapter = MagicMock()
    adapter.search_policies = AsyncMock(return_value=return_value)
    adapter.search_purchases = AsyncMock(return_value=return_value)
    adapter.close = AsyncMock(return_value=None)
    return adapter


@pytest.mark.asyncio
async def test_search_policies_returns_adapter_results() -> None:
    expected = [{"platform": "best_buy", "policy_text_full": "..."}]
    adapter = _make_adapter_mock(expected)
    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_policies(query="Best Buy", limit=5)
    assert result == expected
    adapter.search_policies.assert_awaited_once_with(query="Best Buy", limit=5)


@pytest.mark.asyncio
async def test_search_policies_closes_adapter_on_success() -> None:
    adapter = _make_adapter_mock([])
    with patch("search.get_search_adapter", return_value=adapter):
        await search_policies(query="anything")
    adapter.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_policies_closes_adapter_on_exception() -> None:
    """Adapter must be closed even if the underlying search call raises —
    otherwise we leak connections to the Elastic backend. A non-classified
    exception now resolves to a structured-error dict (BUG-31) rather than
    bubbling up to the LLM as a raw traceback."""
    adapter = _make_adapter_mock([])
    adapter.search_policies = AsyncMock(side_effect=RuntimeError("boom"))
    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_policies(query="anything")
    assert result == {
        "error": "search_unavailable",
        "message": "Policy search is temporarily slow, please try again.",
    }
    adapter.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_policies_default_limit_is_five() -> None:
    adapter = _make_adapter_mock([])
    with patch("search.get_search_adapter", return_value=adapter):
        await search_policies(query="x")
    adapter.search_policies.assert_awaited_once_with(query="x", limit=5)


@pytest.mark.asyncio
async def test_search_user_purchases_passes_user_id() -> None:
    """user_id is the security-critical argument — must reach the adapter
    unchanged so user scoping is enforced at the search layer."""
    expected = [{"_id": "p1", "product_name": "Sony WH-1000XM5"}]
    adapter = _make_adapter_mock(expected)
    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_user_purchases(user_id="user-123", query="Sony headphones", limit=7)
    assert result == expected
    adapter.search_purchases.assert_awaited_once_with(
        user_id="user-123", query="Sony headphones", limit=7
    )


@pytest.mark.asyncio
async def test_search_user_purchases_default_limit_is_ten() -> None:
    adapter = _make_adapter_mock([])
    with patch("search.get_search_adapter", return_value=adapter):
        await search_user_purchases(user_id="u", query="q")
    adapter.search_purchases.assert_awaited_once_with(user_id="u", query="q", limit=10)


@pytest.mark.asyncio
async def test_search_user_purchases_closes_adapter() -> None:
    adapter = _make_adapter_mock([])
    with patch("search.get_search_adapter", return_value=adapter):
        await search_user_purchases(user_id="u", query="q")
    adapter.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_user_purchases_closes_adapter_on_exception() -> None:
    """Symmetry with the policies cleanup test — adapter must close even when
    the search call raises, and the LLM gets a structured error rather than
    a raw RuntimeError."""
    adapter = _make_adapter_mock([])
    adapter.search_purchases = AsyncMock(side_effect=RuntimeError("boom"))
    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_user_purchases(user_id="u1", query="test")
    assert result["error"] == "search_unavailable"
    adapter.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# Limit validation + clamp (Fix 3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_policies_rejects_zero_limit() -> None:
    with pytest.raises(ValueError, match="limit must be >= 1"):
        await search_policies(query="x", limit=0)


@pytest.mark.asyncio
async def test_search_policies_rejects_negative_limit() -> None:
    with pytest.raises(ValueError, match="limit must be >= 1"):
        await search_policies(query="x", limit=-5)


@pytest.mark.asyncio
async def test_search_policies_clamps_excessive_limit() -> None:
    """Caller-supplied limits over MAX_POLICY_LIMIT are silently capped."""
    from src.tools.search_tools import MAX_POLICY_LIMIT

    adapter = _make_adapter_mock([])
    with patch("search.get_search_adapter", return_value=adapter):
        await search_policies(query="x", limit=9999)
    adapter.search_policies.assert_awaited_once_with(query="x", limit=MAX_POLICY_LIMIT)


@pytest.mark.asyncio
async def test_search_user_purchases_rejects_zero_limit() -> None:
    with pytest.raises(ValueError, match="limit must be >= 1"):
        await search_user_purchases(user_id="u", query="x", limit=0)


@pytest.mark.asyncio
async def test_search_user_purchases_clamps_excessive_limit() -> None:
    from src.tools.search_tools import MAX_PURCHASE_LIMIT

    adapter = _make_adapter_mock([])
    with patch("search.get_search_adapter", return_value=adapter):
        await search_user_purchases(user_id="u", query="x", limit=9999)
    adapter.search_purchases.assert_awaited_once_with(
        user_id="u", query="x", limit=MAX_PURCHASE_LIMIT
    )


# ---------------------------------------------------------------------------
# BUG-31 / BUG-61 — timeout, retry, classify, structured errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_policies_retries_once_on_transient_then_succeeds() -> None:
    """ConnectionTimeout is the canonical transient failure — the wrapper
    should swallow the first one, sleep briefly, and surface the second
    attempt's result. Without retry, every ES blip became a user-visible
    failure (BUG-31)."""
    expected = [{"platform": "best_buy"}]
    adapter = MagicMock()
    adapter.search_policies = AsyncMock(
        side_effect=[ConnectionTimeout("first attempt timed out"), expected]
    )
    adapter.close = AsyncMock(return_value=None)

    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_policies(query="Best Buy")

    assert result == expected
    assert adapter.search_policies.await_count == 2
    adapter.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_policies_returns_structured_error_when_transient_exhausted() -> None:
    """Two consecutive transient failures — wrapper gives up and returns
    `{"error": "search_unavailable", ...}` so the LLM tells the user the
    system is slow instead of hallucinating an answer."""
    adapter = MagicMock()
    adapter.search_policies = AsyncMock(side_effect=ConnectionTimeout("still timing out"))
    adapter.close = AsyncMock(return_value=None)

    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_policies(query="anything")

    assert result == {
        "error": "search_unavailable",
        "message": "Policy search is temporarily slow, please try again.",
    }
    assert adapter.search_policies.await_count == 2  # max attempts
    adapter.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_policies_does_not_retry_on_4xx() -> None:
    """AuthenticationException (401) means our API key is wrong — retrying
    will just fail again and waste the user's time. The classifier must
    short-circuit after the first attempt."""
    adapter = MagicMock()
    adapter.search_policies = AsyncMock(side_effect=_make_api_error(401, AuthenticationException))
    adapter.close = AsyncMock(return_value=None)

    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_policies(query="anything")

    assert result["error"] == "search_unavailable"
    assert adapter.search_policies.await_count == 1
    adapter.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_policies_retries_on_5xx_api_error() -> None:
    """A 503 from the ES cluster is transient — give it one more try
    before surfacing the failure."""
    expected = [{"platform": "best_buy"}]
    adapter = MagicMock()
    adapter.search_policies = AsyncMock(side_effect=[_make_api_error(503), expected])
    adapter.close = AsyncMock(return_value=None)

    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_policies(query="x")

    assert result == expected
    assert adapter.search_policies.await_count == 2


@pytest.mark.asyncio
async def test_search_policies_timeout_returns_structured_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A wedged adapter that never returns must not hang the tool call
    (BUG-61). asyncio.wait_for fires, the classifier treats it as
    transient, the second attempt also times out, and the LLM gets a
    structured error."""
    # Slash the timeout so the test runs fast — production stays at 8s.
    monkeypatch.setattr("src.tools.search_tools._TOOL_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr("src.tools.search_tools._RETRY_BACKOFF_SECONDS", 0.0)

    async def never_returns(**_kwargs: object) -> list[dict[str, object]]:
        await asyncio.sleep(5)
        return []

    adapter = MagicMock()
    adapter.search_policies = AsyncMock(side_effect=never_returns)
    adapter.close = AsyncMock(return_value=None)

    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_policies(query="x")

    assert result["error"] == "search_unavailable"
    adapter.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_user_purchases_retries_on_transient() -> None:
    """Same retry policy applies to the purchases tool — proves the helper
    is shared rather than a per-tool copy."""
    expected = [{"product_name": "Sony WH-1000XM5"}]
    adapter = MagicMock()
    adapter.search_purchases = AsyncMock(
        side_effect=[ConnectionTimeout("first attempt timed out"), expected]
    )
    adapter.close = AsyncMock(return_value=None)

    with patch("search.get_search_adapter", return_value=adapter):
        result = await search_user_purchases(user_id="u", query="headphones")

    assert result == expected
    assert adapter.search_purchases.await_count == 2
