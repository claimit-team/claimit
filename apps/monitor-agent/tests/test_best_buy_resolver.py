"""Unit tests for BestBuyResolver with mocked ScraperAPI structured search."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from src.resolver import base as resolver_base
from src.resolver.best_buy import BestBuyResolver

SERP = {
    "organic_results": [
        {
            "title": "Sony WH-1000XM5 Wireless Headphones",
            "link": "https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p",
        },
        {"title": "Amazon listing", "link": "https://www.amazon.com/dp/B09XS7JWHH"},
        {
            "title": "Best Buy headphones category",
            "link": "https://www.bestbuy.com/site/headphones/abcat0204.c",
        },
    ]
}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCRAPERAPI_KEY", "test-key")
    resolver_base._api_key = None
    BestBuyResolver._cache = {}


def _resp(payload: dict) -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = payload
    resp.raise_for_status = MagicMock()
    return resp


def test_resolve_filters_to_product_urls() -> None:
    resolver = BestBuyResolver()
    with patch("src.resolver.best_buy.requests.get", return_value=_resp(SERP)):
        candidates = resolver.resolve("Sony WH-1000XM5", 349.99)
    assert len(candidates) == 1
    assert candidates[0].url.endswith("/6505727.p")
    assert candidates[0].product_id == "6505727"


def test_is_product_url() -> None:
    resolver = BestBuyResolver()
    assert resolver.is_product_url("https://www.bestbuy.com/site/x/6505727.p")
    assert not resolver.is_product_url("https://www.bestbuy.com/site/headphones/abcat0204.c")
    assert not resolver.is_product_url("https://www.amazon.com/dp/B09XS7JWHH")


def test_resolve_empty_results() -> None:
    resolver = BestBuyResolver()
    with patch("src.resolver.best_buy.requests.get", return_value=_resp({"organic_results": []})):
        assert resolver.resolve("nonexistent gadget", 1.0) == []


def test_resolve_caches_by_query() -> None:
    resolver = BestBuyResolver()
    with patch("src.resolver.best_buy.requests.get", return_value=_resp(SERP)) as mock_get:
        resolver.resolve("Sony WH-1000XM5", 349.99)
        resolver.resolve("Sony WH-1000XM5", 349.99)
        assert mock_get.call_count == 1
