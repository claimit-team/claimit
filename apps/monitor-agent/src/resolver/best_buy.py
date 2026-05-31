"""Best Buy product-URL resolver via ScraperAPI structured Google Search.

Best Buy's official Products API is free but gated (no free-email keys +
approval), so we resolve through ScraperAPI's structured Google Search
endpoint instead — querying ``<name> site:bestbuy.com`` and filtering the
organic results down to canonical product pages (``/site/.../<sku>.p``).

The structured endpoint returns parsed JSON, so this costs a SERP request and
needs no ``render`` — far cheaper than scraping a rendered page.
"""

from __future__ import annotations

import re
import time
from typing import ClassVar

import requests

from .base import (
    STRUCTURED_GOOGLE_SEARCH_ENDPOINT,
    Candidate,
    ProductUrlResolver,
    ResolveError,
    get_scraperapi_key,
)

# Canonical Best Buy product page: /site/<slug>/<sku>.p  (sku = 7-ish digits).
_PRODUCT_PATH_RE = re.compile(r"^/site/.+/(\d+)\.p$")
_CACHE_TTL_SECONDS = 300


class BestBuyResolver(ProductUrlResolver):
    host = "www.bestbuy.com"

    # Query -> (cached_at, candidates). Avoids duplicate SERP spend within a
    # sweep / across the handler + cron retries.
    _cache: ClassVar[dict[str, tuple[float, list[Candidate]]]] = {}

    def is_product_url(self, url: str) -> bool:
        from urllib.parse import urlparse

        return self.host_ok(url) and bool(_PRODUCT_PATH_RE.match(urlparse(url).path))

    def _extract_sku(self, url: str) -> str | None:
        from urllib.parse import urlparse

        match = _PRODUCT_PATH_RE.match(urlparse(url).path)
        return match.group(1) if match else None

    def resolve(self, product_name: str, price_paid: float) -> list[Candidate]:
        query = f"{product_name} site:bestbuy.com"
        cached = self._cache.get(query)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

        params = {
            "api_key": get_scraperapi_key(),
            "query": query,
            "country_code": "us",
        }
        try:
            response = requests.get(STRUCTURED_GOOGLE_SEARCH_ENDPOINT, params=params, timeout=60)
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            status = (
                str(exc.response.status_code)
                if getattr(exc, "response", None) is not None
                else type(exc).__name__
            )
            raise ResolveError(f"ScraperAPI google search failed: {status}") from exc
        except ValueError as exc:  # non-JSON body
            raise ResolveError("ScraperAPI google search returned non-JSON") from exc

        candidates: list[Candidate] = []
        for result in payload.get("organic_results", []) or []:
            link = result.get("link") or result.get("url") or ""
            if not link or not self.is_product_url(link):
                continue
            candidates.append(
                Candidate(
                    url=link,
                    product_id=self._extract_sku(link),
                    title=result.get("title"),
                    # Best Buy SERP price strings are unreliable; leave None so
                    # the orchestrator treats price-bounding as "unknown -> pass".
                    listed_price=None,
                )
            )

        self._cache[query] = (time.time(), candidates)
        return candidates
