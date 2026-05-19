"""Unit tests for tools/search_tools.py.

Mocks `search.get_search_adapter` (the lazy import inside each tool) so
tests do not require Elasticsearch / Atlas Search connectivity.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.tools.search_tools import search_policies, search_user_purchases


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
    otherwise we leak connections to the Elastic backend."""
    adapter = _make_adapter_mock([])
    adapter.search_policies = AsyncMock(side_effect=RuntimeError("boom"))
    with (
        patch("search.get_search_adapter", return_value=adapter),
        pytest.raises(RuntimeError, match="boom"),
    ):
        await search_policies(query="anything")
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
