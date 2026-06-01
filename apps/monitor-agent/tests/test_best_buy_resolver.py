"""Unit tests for BestBuyResolver: Structured Google primary + render fallback."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import requests
from src.resolver import base as resolver_base
from src.resolver.base import ResolveError
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

SEARCH_HTML = """
<html><body>
<a href="/site/sony-wh-1000xm5/6505727.p">Sony WH-1000XM5</a>
<a href="/site/sony-wh-1000xm5/6505727.p">duplicate skipped</a>
<a href="/site/headphones/abcat0204.c">category not a product</a>
</body></html>
"""


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


def _html_resp(html: str) -> MagicMock:
    resp = MagicMock()
    resp.text = html
    resp.raise_for_status = MagicMock()
    return resp


def test_resolve_filters_to_product_urls() -> None:
    resolver = BestBuyResolver()
    with patch("src.resolver.best_buy.requests.get", return_value=_resp(SERP)) as mock_get:
        candidates = resolver.resolve("Sony WH-1000XM5", 349.99)
        # Primary returns a hit -> render fallback never called.
        assert mock_get.call_count == 1
    assert len(candidates) == 1
    assert candidates[0].url.endswith("/6505727.p")
    assert candidates[0].product_id == "6505727"


def test_is_product_url() -> None:
    resolver = BestBuyResolver()
    assert resolver.is_product_url("https://www.bestbuy.com/site/x/6505727.p")
    assert not resolver.is_product_url("https://www.bestbuy.com/site/headphones/abcat0204.c")
    assert not resolver.is_product_url("https://www.amazon.com/dp/B09XS7JWHH")


def test_resolve_empty_when_both_paths_empty() -> None:
    resolver = BestBuyResolver()
    # Primary returns no product hits AND render returns no product anchors.
    with patch(
        "src.resolver.best_buy.requests.get",
        side_effect=[_resp({"organic_results": []}), _html_resp("<html></html>")],
    ) as mock_get:
        assert resolver.resolve("nonexistent gadget", 1.0) == []
        assert mock_get.call_count == 2


def test_resolve_caches_by_product_name() -> None:
    resolver = BestBuyResolver()
    with patch("src.resolver.best_buy.requests.get", return_value=_resp(SERP)) as mock_get:
        resolver.resolve("Sony WH-1000XM5", 349.99)
        resolver.resolve("Sony WH-1000XM5", 349.99)
        # Second call hits cache -> still 1 outbound request.
        assert mock_get.call_count == 1


def test_falls_through_to_render_when_structured_google_empty() -> None:
    """Primary SERP has no product hits -> render fallback runs and resolves."""
    resolver = BestBuyResolver()
    with patch(
        "src.resolver.best_buy.requests.get",
        side_effect=[_resp({"organic_results": []}), _html_resp(SEARCH_HTML)],
    ) as mock_get:
        candidates = resolver.resolve("Sony WH-1000XM5", 349.99)
        assert mock_get.call_count == 2
    assert len(candidates) == 1
    assert candidates[0].url == "https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p"
    assert candidates[0].product_id == "6505727"


def test_falls_through_to_render_on_structured_google_transport_error() -> None:
    """Primary transport failure soft-fails to [], render fallback resolves."""
    resolver = BestBuyResolver()
    with patch(
        "src.resolver.best_buy.requests.get",
        side_effect=[requests.ConnectionError("boom"), _html_resp(SEARCH_HTML)],
    ) as mock_get:
        candidates = resolver.resolve("Sony WH-1000XM5", 349.99)
        assert mock_get.call_count == 2
    assert len(candidates) == 1
    assert candidates[0].url == "https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p"


def test_render_fallback_raises_resolve_error_on_transport_failure() -> None:
    """Primary empty + render transport failure -> ResolveError surfaces."""
    resolver = BestBuyResolver()
    with (
        patch(
            "src.resolver.best_buy.requests.get",
            side_effect=[_resp({"organic_results": []}), requests.ConnectionError("boom")],
        ),
        pytest.raises(ResolveError),
    ):
        resolver.resolve("Sony WH-1000XM5", 349.99)
