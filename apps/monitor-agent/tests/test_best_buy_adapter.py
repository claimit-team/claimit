"""Unit tests for BestBuyAdapter with mocked HTTP."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from src.adapters.base import PriceFetchError
from src.adapters.best_buy import BestBuyAdapter

SAMPLE_HTML = """
<html>
<body>
<script>{"customerPrice":249.99,"memberPrice":229.99}</script>
</body>
</html>
"""

NO_PRICE_HTML = """
<html><body><div>No price here</div></body></html>
"""


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset class-level cache and API key between tests."""
    monkeypatch.setenv("SCRAPERAPI_KEY", "test-key")
    BestBuyAdapter._cache = {}
    BestBuyAdapter._api_key = None


@pytest.mark.asyncio
async def test_parses_current_price() -> None:
    adapter = BestBuyAdapter()
    with patch("src.adapters.best_buy.requests.get") as mock_get:
        mock_response = MagicMock()
        mock_response.text = SAMPLE_HTML
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        snapshot = await adapter.fetch_current_price(
            platform="best_buy",
            product_id="6505727",
            product_url="https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p",
        )

        assert snapshot.platform == "best_buy"
        assert snapshot.product_id == "6505727"
        assert snapshot.price_non_member == 249.99
        assert snapshot.price_member == 229.99
        assert snapshot.member_tier_required == "MyBestBuy Plus"
        assert snapshot.currency == "USD"
        assert snapshot.source == "scraperapi"
        assert snapshot.raw_response_hash is not None


@pytest.mark.asyncio
async def test_raises_when_no_price_found() -> None:
    adapter = BestBuyAdapter()
    with patch("src.adapters.best_buy.requests.get") as mock_get:
        mock_response = MagicMock()
        mock_response.text = NO_PRICE_HTML
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        with pytest.raises(PriceFetchError, match="Could not parse"):
            await adapter.fetch_current_price(
                platform="best_buy",
                product_id="6505727",
                product_url="https://www.bestbuy.com/site/foo/6505727.p",
            )


@pytest.mark.asyncio
async def test_raises_when_no_url() -> None:
    adapter = BestBuyAdapter()
    with pytest.raises(PriceFetchError, match="requires product_url"):
        await adapter.fetch_current_price(
            platform="best_buy",
            product_id="6505727",
            product_url=None,
        )


@pytest.mark.asyncio
async def test_caches_response() -> None:
    adapter = BestBuyAdapter()
    with patch("src.adapters.best_buy.requests.get") as mock_get:
        mock_response = MagicMock()
        mock_response.text = SAMPLE_HTML
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        url = "https://www.bestbuy.com/site/foo/6505727.p"
        await adapter.fetch_current_price("best_buy", "6505727", url)
        await adapter.fetch_current_price("best_buy", "6505727", url)

        # Second call should hit cache, not requests.get
        assert mock_get.call_count == 1
