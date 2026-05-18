"""Best Buy adapter — fetches product pages via ScraperAPI."""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import time
from datetime import UTC, datetime
from typing import ClassVar
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from google.cloud import secretmanager

from ..services.screenshot import capture as capture_screenshot
from .base import PriceFetchError, PriceSnapshot, PriceSourceAdapter

SCRAPERAPI_ENDPOINT = "https://api.scraperapi.com/"
CACHE_TTL_SECONDS = 60
_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "claimit-beta")


class BestBuyAdapter(PriceSourceAdapter):
    """Fetches Best Buy product pages via ScraperAPI.

    Caches responses for CACHE_TTL_SECONDS to avoid duplicate API calls
    during a single monitoring sweep.
    """

    _cache: ClassVar[dict[str, tuple[float, str]]] = {}
    _api_key: ClassVar[str | None] = None

    @classmethod
    def _get_api_key(cls) -> str:
        """Load ScraperAPI key from env var (override) or GCP Secret Manager."""
        if cls._api_key is None:
            # Allow env var override for local testing
            env_key = os.environ.get("SCRAPERAPI_KEY")
            if env_key:
                cls._api_key = env_key
            else:
                client = secretmanager.SecretManagerServiceClient()
                secret_path = f"projects/{_PROJECT_ID}/secrets/scraperapi-key/versions/latest"
                response = client.access_secret_version(name=secret_path)
                cls._api_key = response.payload.data.decode("utf-8")
        return cls._api_key

    def _fetch_page(self, url: str) -> str:
        """Fetch a Best Buy product page through ScraperAPI.

        Returns cached HTML if within CACHE_TTL_SECONDS, otherwise calls
        ScraperAPI with premium=true + country_code=us (required for the
        protected bestbuy.com domain). Raises PriceFetchError on HTTP failures
        without leaking the API key.
        """
        # Cache check uses current time (read-only)
        if url in self._cache:
            cached_at, html = self._cache[url]
            if time.time() - cached_at < CACHE_TTL_SECONDS:
                return html

        params = {
            "api_key": self._get_api_key(),
            "url": url,
            "render": "true",
            "country_code": "us",
            "premium": "true",
        }
        try:
            response = requests.get(SCRAPERAPI_ENDPOINT, params=params, timeout=60)
            response.raise_for_status()
        except requests.RequestException as e:
            # Avoid leaking ScraperAPI key from prepared URL in str(e)
            status = (
                str(e.response.status_code)
                if getattr(e, "response", None) is not None
                else type(e).__name__
            )
            raise PriceFetchError("best_buy", url, f"ScraperAPI request failed: {status}") from e

        html = response.text
        # Use post-fetch timestamp to reflect when content was actually retrieved
        self._cache[url] = (time.time(), html)
        return html

    def _parse_price(self, html: str) -> float | None:
        """Extract current price from Apollo GraphQL state embedded in HTML.

        Best Buy embeds prices in JSON: "customerPrice":278
        This is more stable than HTML selectors.
        """
        match = re.search(r'"customerPrice"\s*:\s*(\d+(?:\.\d+)?)', html)
        if match:
            return float(match.group(1))

        soup = BeautifulSoup(html, "html.parser")
        price_el = soup.find(attrs={"data-testid": "price-block-customer-price"})
        if price_el:
            text = price_el.get_text(strip=True)
            m = re.search(r"\$?([\d,]+\.\d{2})", text)
            if m:
                return float(m.group(1).replace(",", ""))
        return None

    def _parse_member_price(self, html: str) -> float | None:
        """Extract MyBestBuy Plus/Total member price from Apollo state."""
        match = re.search(r'"memberPrice"\s*:\s*(\d+(?:\.\d+)?)', html)
        if match:
            return float(match.group(1))
        return None

    async def fetch_current_price(
        self,
        platform: str,
        product_id: str,
        product_url: str | None = None,
        member_tier: str | None = None,
    ) -> PriceSnapshot:
        """Fetch current Best Buy price for the given product URL.

        Validates that the URL is on bestbuy.com to prevent SSRF and accidental
        credit burn on non-BestBuy domains. Runs the synchronous _fetch_page in
        a worker thread to avoid blocking the event loop.

        Raises:
            PriceFetchError: if product_url missing, host invalid, request fails,
                or both price selectors return None.
        """
        if not product_url:
            raise PriceFetchError(platform, product_id, "Best Buy adapter requires product_url")

        host = (urlparse(product_url).hostname or "").lower()
        if not (host == "www.bestbuy.com" or host.endswith(".bestbuy.com")):
            raise PriceFetchError(
                platform, product_id, "Best Buy adapter requires a bestbuy.com URL"
            )

        html = await asyncio.to_thread(self._fetch_page, product_url)

        price_non_member = self._parse_price(html)
        price_member = self._parse_member_price(html)

        if price_non_member is None and price_member is None:
            raise PriceFetchError(
                platform, product_id, "Could not parse any price from Best Buy page"
            )

        member_tier_required = "MyBestBuy Plus" if price_member else None

        screenshot_url = await capture_screenshot(
            url=product_url,
            platform="best_buy",
            product_id=product_id,
            wait_selector='[data-testid="price-block-customer-price"]',
        )

        return PriceSnapshot(
            platform=platform,
            product_id=product_id,
            price_member=price_member,
            price_non_member=price_non_member,
            member_tier_required=member_tier_required,
            currency="USD",
            checked_at=datetime.now(UTC),
            source="scraperapi",
            evidence_screenshot_url=screenshot_url,
            raw_response_hash=hashlib.sha256(html.encode("utf-8")).hexdigest()[:16],
        )
