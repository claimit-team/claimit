"""Unit tests for TargetAdapter with mocked HTTP."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from src.adapters.base import PriceFetchError
from src.adapters.target import TargetAdapter

SAMPLE_HTML = """
<html>
<body>
<div data-test="@web/Price/PriceFull">
  <span data-test="product-price">$249.99</span>
</div>
</body>
</html>
"""

NO_PRICE_HTML = """
<html><body><div>No price container</div></body></html>
"""

RENDER_INCOMPLETE_HTML = """
<html><body><div data-test="product-title">AirPods Pro</div></body></html>
"""


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCRAPERAPI_KEY", "test-key")
    TargetAdapter._cache = {}
    TargetAdapter._api_key = None


@pytest.mark.asyncio
async def test_parses_current_price() -> None:
    adapter = TargetAdapter()
    with patch("src.adapters.target.requests.get") as mock_get:
        mock_response = MagicMock()
        mock_response.text = SAMPLE_HTML
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        snapshot = await adapter.fetch_current_price(
            platform="target",
            product_id="85978622",
            product_url="https://www.target.com/p/apple-airpods-pro/-/A-85978622",
        )

        assert snapshot.platform == "target"
        assert snapshot.product_id == "85978622"
        assert snapshot.price_non_member == 249.99
        assert snapshot.price_member is None
        assert snapshot.member_tier_required is None
        assert snapshot.currency == "USD"
        assert snapshot.source == "scraperapi"


@pytest.mark.asyncio
async def test_raises_when_render_incomplete() -> None:
    adapter = TargetAdapter()
    with patch("src.adapters.target.requests.get") as mock_get:
        mock_response = MagicMock()
        mock_response.text = RENDER_INCOMPLETE_HTML
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        with pytest.raises(PriceFetchError, match="render"):
            await adapter.fetch_current_price(
                platform="target",
                product_id="85978622",
                product_url="https://www.target.com/p/foo/-/A-85978622",
            )


@pytest.mark.asyncio
async def test_rejects_non_target_url() -> None:
    adapter = TargetAdapter()
    with pytest.raises(PriceFetchError, match=r"target\.com URL"):
        await adapter.fetch_current_price(
            platform="target",
            product_id="85978622",
            product_url="https://www.bestbuy.com/site/foo/123.p",
        )


@pytest.mark.asyncio
async def test_raises_when_no_url() -> None:
    adapter = TargetAdapter()
    with pytest.raises(PriceFetchError, match="requires product_url"):
        await adapter.fetch_current_price(
            platform="target",
            product_id="85978622",
            product_url=None,
        )


@pytest.mark.asyncio
async def test_caches_response() -> None:
    adapter = TargetAdapter()
    with patch("src.adapters.target.requests.get") as mock_get:
        mock_response = MagicMock()
        mock_response.text = SAMPLE_HTML
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        url = "https://www.target.com/p/foo/-/A-85978622"
        await adapter.fetch_current_price("target", "85978622", url)
        await adapter.fetch_current_price("target", "85978622", url)

        assert mock_get.call_count == 1
