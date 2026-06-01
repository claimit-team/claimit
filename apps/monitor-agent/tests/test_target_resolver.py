"""Unit tests for TargetResolver: RedSky primary + render fallback."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from src.resolver import base as resolver_base
from src.resolver.target import TargetResolver

REDSKY = {
    "data": {
        "search": {
            "products": [
                {
                    "tcin": "12345678",
                    "item": {"product_description": {"title": "Dyson V8 Cordless Vacuum"}},
                    "price": {"current_retail": 399.99},
                }
            ]
        }
    }
}

SEARCH_HTML = """
<html><body>
<a href="/p/dyson-v8-cordless-vacuum/-/A-87654321">Dyson V8 Cordless Vacuum</a>
</body></html>
"""


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCRAPERAPI_KEY", "test-key")
    resolver_base._api_key = None
    TargetResolver._cache = {}


def _json_resp(payload: dict) -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = payload
    resp.raise_for_status = MagicMock()
    return resp


def _html_resp(html: str) -> MagicMock:
    resp = MagicMock()
    resp.text = html
    resp.raise_for_status = MagicMock()
    return resp


def test_redsky_primary_resolves_tcin() -> None:
    resolver = TargetResolver()
    with patch("src.resolver.target.requests.get", return_value=_json_resp(REDSKY)) as mock_get:
        candidates = resolver.resolve("Dyson V8 Cordless Vacuum", 399.99)
        assert mock_get.call_count == 1  # only the RedSky call; no fallback
    assert len(candidates) == 1
    assert candidates[0].url == "https://www.target.com/p/-/A-12345678"
    assert candidates[0].product_id == "12345678"
    assert candidates[0].listed_price == 399.99


def test_falls_back_to_search_render() -> None:
    resolver = TargetResolver()
    # Primary returns no products -> fallback renders the search page.
    with patch(
        "src.resolver.target.requests.get",
        side_effect=[_json_resp({"data": {"search": {"products": []}}}), _html_resp(SEARCH_HTML)],
    ) as mock_get:
        candidates = resolver.resolve("Dyson V8 Cordless Vacuum", 399.99)
        assert mock_get.call_count == 2
    assert len(candidates) == 1
    assert candidates[0].url == "https://www.target.com/p/-/A-87654321"


def test_is_product_url() -> None:
    resolver = TargetResolver()
    assert resolver.is_product_url("https://www.target.com/p/x/-/A-12345678")
    assert not resolver.is_product_url("https://www.target.com/c/vacuums")
    assert not resolver.is_product_url("https://www.bestbuy.com/site/x/1.p")
