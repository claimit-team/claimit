"""Target adapter — fetches product pages via ScraperAPI.

Target uses client-side price hydration (gated by
isProductDetailServerSideRenderPriceEnabled), so the price is only present
in the DOM after ScraperAPI's render=true completes. Extraction uses the
data-test="product-price" anchor, with strikethroughFormattedRegPrice as a
sale-only secondary signal. Target Circle (member) prices aren't reliably
present on standard products and are not extracted in this adapter.
"""

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

from .base import PriceFetchError, PriceSnapshot, PriceSourceAdapter

SCRAPERAPI_ENDPOINT = "https://api.scraperapi.com/"
CACHE_TTL_SECONDS = 60
_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "claimit-beta")


class TargetAdapter(PriceSourceAdapter):
    """Fetches Target.com product pages via ScraperAPI.

    Caches responses for CACHE_TTL_SECONDS to avoid duplicate API calls
    during a single monitoring sweep.
    """

    _cache: ClassVar[dict[str, tuple[float, str]]] = {}
    _api_key: ClassVar[str | None] = None

    @classmethod
    def _get_api_key(cls) -> str:
        if cls._api_key is None:
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
        now = time.time()
        if url in self._cache:
            cached_at, html = self._cache[url]
            if now - cached_at < CACHE_TTL_SECONDS:
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
            raise PriceFetchError("target", url, f"ScraperAPI request failed: {e}") from e

        html = response.text
        self._cache[url] = (now, html)
        return html

    def _parse_current_price(self, html: str) -> float | None:
        """Extract current price from data-test='product-price' anchor."""
        soup = BeautifulSoup(html, "html.parser")
        price_el = soup.find(attrs={"data-test": "product-price"})
        if price_el is None:
            return None
        text = price_el.get_text(strip=True)
        match = re.search(r"\$?([\d,]+\.\d{2})", text)
        if match:
            return float(match.group(1).replace(",", ""))
        return None

    def _has_price_container(self, html: str) -> bool:
        """Check if the price block container rendered at all.

        Target hydrates prices client-side; if ScraperAPI's render=true didn't
        complete, the container won't appear. Distinguishes 'no price found'
        from 'render incomplete'.
        """
        return 'data-test="@web/Price/PriceFull"' in html or 'data-test="product-price"' in html

    async def fetch_current_price(
        self,
        platform: str,
        product_id: str,
        product_url: str | None = None,
        member_tier: str | None = None,
    ) -> PriceSnapshot:
        if not product_url:
            raise PriceFetchError(platform, product_id, "Target adapter requires product_url")

        host = (urlparse(product_url).hostname or "").lower()
        if not (host == "www.target.com" or host.endswith(".target.com")):
            raise PriceFetchError(platform, product_id, "Target adapter requires a target.com URL")

        html = await asyncio.to_thread(self._fetch_page, product_url)

        if not self._has_price_container(html):
            raise PriceFetchError(
                platform,
                product_id,
                "Target price container not found — likely incomplete client render",
            )

        price_non_member = self._parse_current_price(html)

        if price_non_member is None:
            raise PriceFetchError(
                platform, product_id, "Could not parse current price from Target page"
            )

        # Target Circle (member) pricing is not reliably extractable from standard
        # product pages — only appears on Circle Week promo items. TODO: add support
        # when we have a stable Circle-promoted test product.
        return PriceSnapshot(
            platform=platform,
            product_id=product_id,
            price_member=None,
            price_non_member=price_non_member,
            member_tier_required=None,
            currency="USD",
            checked_at=datetime.now(UTC),
            source="scraperapi",
            evidence_screenshot_url=None,
            raw_response_hash=hashlib.sha256(html.encode("utf-8")).hexdigest()[:16],
        )
