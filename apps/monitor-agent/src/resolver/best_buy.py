"""Best Buy product-URL resolver via ScraperAPI.

Best Buy's official Products API is gated (no free-email keys + approval), so
we resolve through ScraperAPI in two tiers:

1. PRIMARY — ScraperAPI Structured Google Search (``<name> site:bestbuy.com``)
   filtered to canonical product paths (``/site/.../<sku>.p``). Returns parsed
   JSON, so this is cheap (~25 credits, no ``render``).
2. FALLBACK — ScraperAPI ``render=true`` on the on-site search page
   (``bestbuy.com/site/searchpage.jsp?st=``); parse product-card hrefs ->
   ``<sku>.p``. Independent of the Structured Google endpoint, so resolution
   degrades gracefully on plans that don't include it or on transient JSON
   failures.
"""

from __future__ import annotations

import re
import time
from typing import ClassVar
from urllib.parse import quote_plus, urlparse

import requests
from bs4 import BeautifulSoup

from .base import (
    SCRAPERAPI_ENDPOINT,
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

    # product_name -> (cached_at, candidates). Covers both tiers so a primary
    # miss + fallback hit isn't re-fetched on the next call within the TTL.
    _cache: ClassVar[dict[str, tuple[float, list[Candidate]]]] = {}

    def is_product_url(self, url: str) -> bool:
        return self.host_ok(url) and bool(_PRODUCT_PATH_RE.match(urlparse(url).path))

    @staticmethod
    def _extract_sku(url: str) -> str | None:
        match = _PRODUCT_PATH_RE.match(urlparse(url).path)
        return match.group(1) if match else None

    def resolve(self, product_name: str, price_paid: float) -> list[Candidate]:
        """Two-tier resolution: Structured Google primary, render fallback.

        Primary failures (transport, non-JSON, plan-doesn't-include-endpoint)
        soft-fail to ``[]`` so the fallback always runs. The fallback raises
        ``ResolveError`` only on its own transport failure.
        """
        cached = self._cache.get(product_name)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

        candidates = self._resolve_structured_google(product_name)
        if not candidates:
            candidates = self._resolve_search_render(product_name)

        self._cache[product_name] = (time.time(), candidates)
        return candidates

    def _resolve_structured_google(self, product_name: str) -> list[Candidate]:
        """Primary: SERP filter for /site/.../<sku>.p URLs. Soft-fails to []."""
        query = f"{product_name} site:bestbuy.com"
        params = {
            "api_key": get_scraperapi_key(),
            "query": query,
            "country_code": "us",
        }
        try:
            response = requests.get(STRUCTURED_GOOGLE_SEARCH_ENDPOINT, params=params, timeout=60)
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError):
            # Non-fatal — caller falls through to render fallback.
            return []

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
        return candidates

    def _resolve_search_render(self, product_name: str) -> list[Candidate]:
        """Fallback: render bestbuy.com search page, parse product cards."""
        search_url = f"https://www.bestbuy.com/site/searchpage.jsp?st={quote_plus(product_name)}"
        params = {
            "api_key": get_scraperapi_key(),
            "url": search_url,
            "render": "true",
            "country_code": "us",
            # Best Buy has heavier bot defenses than Target — premium routes
            # through residential proxies. Falls within the ~25-75 credit band.
            "premium": "true",
        }
        try:
            response = requests.get(SCRAPERAPI_ENDPOINT, params=params, timeout=60)
            response.raise_for_status()
            html = response.text
        except requests.RequestException as exc:
            status = (
                str(exc.response.status_code)
                if getattr(exc, "response", None) is not None
                else type(exc).__name__
            )
            raise ResolveError(f"ScraperAPI bestbuy search render failed: {status}") from exc

        soup = BeautifulSoup(html, "html.parser")
        seen: set[str] = set()
        candidates: list[Candidate] = []
        for anchor in soup.find_all("a", href=True):
            path = urlparse(anchor["href"]).path
            match = _PRODUCT_PATH_RE.match(path)
            if not match:
                continue
            sku = match.group(1)
            if sku in seen:
                continue
            seen.add(sku)
            candidates.append(
                Candidate(
                    url=f"https://www.bestbuy.com{path}",
                    product_id=sku,
                    title=anchor.get_text(strip=True) or None,
                    listed_price=None,
                )
            )
            if len(candidates) >= 5:
                break
        return candidates
