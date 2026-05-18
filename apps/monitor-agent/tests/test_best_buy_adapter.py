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
    """Extracts customer + member prices from Apollo JSON embedded in the HTML."""
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
    """Raises PriceFetchError when neither customerPrice JSON nor DOM selector matches."""
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
    """Raises PriceFetchError when product_url is None."""
    adapter = BestBuyAdapter()
    with pytest.raises(PriceFetchError, match="requires product_url"):
        await adapter.fetch_current_price(
            platform="best_buy",
            product_id="6505727",
            product_url=None,
        )


@pytest.mark.asyncio
async def test_rejects_non_bestbuy_url() -> None:
    """Host-validation guard rejects URLs whose host isn't on bestbuy.com."""
    adapter = BestBuyAdapter()
    with pytest.raises(PriceFetchError, match=r"bestbuy\.com URL"):
        await adapter.fetch_current_price(
            platform="best_buy",
            product_id="6505727",
            product_url="https://www.amazon.com/dp/B09XS7JWHH",
        )


@pytest.mark.asyncio
async def test_caches_response() -> None:
    """Second fetch of the same URL within CACHE_TTL_SECONDS hits the cache."""
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


@pytest.mark.asyncio
async def test_error_message_does_not_leak_api_key() -> None:
    """ScraperAPI request failures must not expose the API key in error message."""
    adapter = BestBuyAdapter()
    with patch("src.adapters.best_buy.requests.get") as mock_get:
        from requests.exceptions import HTTPError

        mock_response = MagicMock()
        mock_response.status_code = 500
        http_error = HTTPError(
            "500 Server Error: url=https://api.scraperapi.com/?api_key=SECRET_KEY_LEAK"
        )
        http_error.response = mock_response
        mock_response.raise_for_status.side_effect = http_error
        mock_get.return_value = mock_response

        with pytest.raises(PriceFetchError) as exc_info:
            await adapter.fetch_current_price(
                platform="best_buy",
                product_id="6505727",
                product_url="https://www.bestbuy.com/site/foo/6505727.p",
            )
        assert "SECRET_KEY_LEAK" not in str(exc_info.value)
        assert "api_key" not in str(exc_info.value)
