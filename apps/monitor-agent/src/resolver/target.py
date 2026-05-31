"""Target product-URL resolver via ScraperAPI.

Target has no free official catalog API, so we resolve through ScraperAPI:

1. PRIMARY — route Target's RedSky keyword API (``plp_search_v2``) through
   ScraperAPI as a plain URL fetch. RedSky returns structured JSON, so this is
   cheap (no ``render``) and deterministic: keyword -> TCIN -> canonical
   ``https://www.target.com/p/-/A-<tcin>``. RedSky uses a *public* web key
   (no signup) which Target occasionally rotates — overridable via
   ``TARGET_REDSKY_KEY``.
2. FALLBACK — ScraperAPI ``render=true`` on the on-site search page
   (``target.com/s?searchTerm=``); parse the first product card's href ->
   TCIN. Independent of the RedSky key, so it degrades gracefully if the key
   rotates or the JSON shape changes.
"""

from __future__ import annotations

import os
import re
import time
from typing import ClassVar
from urllib.parse import quote_plus, urlparse

import requests
from bs4 import BeautifulSoup

from .base import (
    SCRAPERAPI_ENDPOINT,
    Candidate,
    ProductUrlResolver,
    ResolveError,
    get_scraperapi_key,
)

# Public RedSky web key observed on target.com network traffic. Overridable in
# case Target rotates it; the render fallback does not depend on it.
_DEFAULT_REDSKY_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96"
_REDSKY_SEARCH_URL = "https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2"

# Canonical Target product page carries the TCIN after "/A-": /p/<slug>/-/A-<tcin>
_TCIN_IN_PATH_RE = re.compile(r"/A-(\d+)")
_CACHE_TTL_SECONDS = 300


class TargetResolver(ProductUrlResolver):
    host = "www.target.com"

    _cache: ClassVar[dict[str, tuple[float, list[Candidate]]]] = {}

    def is_product_url(self, url: str) -> bool:
        path = urlparse(url).path
        return self.host_ok(url) and "/p/" in path and bool(_TCIN_IN_PATH_RE.search(path))

    @staticmethod
    def _redsky_key() -> str:
        return os.environ.get("TARGET_REDSKY_KEY", "").strip() or _DEFAULT_REDSKY_KEY

    @staticmethod
    def _product_url(tcin: str) -> str:
        return f"https://www.target.com/p/-/A-{tcin}"

    def resolve(self, product_name: str, price_paid: float) -> list[Candidate]:
        cached = self._cache.get(product_name)
        if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

        candidates = self._resolve_redsky(product_name)
        if not candidates:
            candidates = self._resolve_search_render(product_name)

        self._cache[product_name] = (time.time(), candidates)
        return candidates

    def _resolve_redsky(self, product_name: str) -> list[Candidate]:
        """Primary path: RedSky keyword JSON routed through ScraperAPI."""
        redsky_url = (
            f"{_REDSKY_SEARCH_URL}?key={self._redsky_key()}"
            f"&keyword={quote_plus(product_name)}&channel=WEB&count=5"
            "&default_purchasability_filter=true&page=%2Fs%2F"
        )
        params = {"api_key": get_scraperapi_key(), "url": redsky_url}
        try:
            response = requests.get(SCRAPERAPI_ENDPOINT, params=params, timeout=60)
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError):
            # Primary failure is non-fatal — the caller falls through to the
            # render fallback. Don't raise; an empty list triggers fallback.
            return []

        products = (
            payload.get("data", {}).get("search", {}).get("products", [])
            if isinstance(payload, dict)
            else []
        )
        candidates: list[Candidate] = []
        for product in products or []:
            tcin = product.get("tcin")
            if not tcin:
                continue
            item = product.get("item", {}) or {}
            title = (item.get("product_description", {}) or {}).get("title")
            price_block = product.get("price", {}) or {}
            listed = price_block.get("current_retail")
            candidates.append(
                Candidate(
                    url=self._product_url(str(tcin)),
                    product_id=str(tcin),
                    title=title,
                    listed_price=float(listed) if isinstance(listed, (int, float)) else None,
                )
            )
        return candidates

    def _resolve_search_render(self, product_name: str) -> list[Candidate]:
        """Fallback: render the on-site search page and read the first card."""
        search_url = f"https://www.target.com/s?searchTerm={quote_plus(product_name)}"
        params = {
            "api_key": get_scraperapi_key(),
            "url": search_url,
            "render": "true",
            "country_code": "us",
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
            raise ResolveError(f"ScraperAPI target search render failed: {status}") from exc

        soup = BeautifulSoup(html, "html.parser")
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"]
            match = _TCIN_IN_PATH_RE.search(href)
            if match and "/p/" in href:
                tcin = match.group(1)
                return [
                    Candidate(
                        url=self._product_url(tcin),
                        product_id=tcin,
                        title=anchor.get_text(strip=True) or None,
                        listed_price=None,
                    )
                ]
        return []
