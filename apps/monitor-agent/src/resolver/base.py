"""Shared base for product-URL resolvers.

A resolver turns a free-text ``product_name`` (plus the price the user paid)
into a validated, on-host product-page URL that the existing ScraperAPI price
adapters (``adapters/best_buy.py`` / ``adapters/target.py``) can scrape. This
mirrors the adapter ABC pattern in ``adapters/base.py`` and reuses the exact
ScraperAPI key-loading pattern (env override -> GCP Secret Manager) so all
ScraperAPI usage stays inside monitor-agent.

The resolver does NOT fetch the candidate page to verify a live price — that is
the cron adapter's job. It only finds a well-formed, on-host product URL; a
404 on a well-formed URL surfaces later as an adapter error and the cron lazy
resolve re-attempts.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import urlparse

# Plain ScraperAPI endpoint (used to proxy an arbitrary URL, e.g. Target RedSky
# or a rendered search page) and the structured Google Search endpoint (used
# for Best Buy SERP resolution — returns parsed JSON, no render credits).
SCRAPERAPI_ENDPOINT = "https://api.scraperapi.com/"
STRUCTURED_GOOGLE_SEARCH_ENDPOINT = "https://api.scraperapi.com/structured/google/search"

_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "claimit-beta")

# Module-level cache of the ScraperAPI key, mirroring the per-adapter ClassVar
# cache in adapters/best_buy.py — load once per process.
_api_key: str | None = None


def get_scraperapi_key() -> str:
    """Load the ScraperAPI key from env (override) or GCP Secret Manager.

    Identical contract to ``adapters/best_buy.py::_get_api_key`` so resolvers
    and price adapters authenticate the same way against the same secret.
    """
    global _api_key
    if _api_key is None:
        env_key = os.environ.get("SCRAPERAPI_KEY")
        if env_key:
            _api_key = env_key
        else:
            from google.cloud import secretmanager

            client = secretmanager.SecretManagerServiceClient()
            secret_path = f"projects/{_PROJECT_ID}/secrets/scraperapi-key/versions/latest"
            response = client.access_secret_version(name=secret_path)
            _api_key = response.payload.data.decode("utf-8")
    return _api_key


class Scenario(StrEnum):
    """Outcome of a resolution attempt — drives the notification + persistence.

    Maps to the confirmation-page spec's 4 scenarios:
      - ALREADY_VALID: existing URL is on-host + well-formed; no-op (idempotency)
      - RESOLVED: blank URL, system found one (scenario 3)
      - CORRECTED: user URL was wrong/off-host, system found a correct one (scenario 1)
      - UNRESOLVED_HAD_URL: user URL invalid and nothing found (scenario 2)
      - UNRESOLVED_BLANK: blank URL and nothing found (scenario 4)
    """

    ALREADY_VALID = "already_valid"
    RESOLVED = "resolved"
    CORRECTED = "corrected"
    UNRESOLVED_HAD_URL = "unresolved_had_url"
    UNRESOLVED_BLANK = "unresolved_blank"


@dataclass(frozen=True)
class Candidate:
    """One ranked product-URL candidate returned by a resolver."""

    url: str
    product_id: str | None
    title: str | None
    listed_price: float | None


@dataclass(frozen=True)
class ResolveResult:
    """Final resolution decision for a purchase."""

    url: str | None
    scenario: Scenario
    confidence: float
    candidate_price: float | None = None
    candidate_id: str | None = None


class ResolveError(Exception):
    """Raised on an unrecoverable resolver transport error.

    Message is kept key-leak-safe (mirrors ``PriceFetchError`` handling in
    ``adapters/best_buy.py``) — never embed the prepared ScraperAPI URL.
    """


class ProductUrlResolver(ABC):
    """Interface every per-platform resolver implements.

    Subclasses set ``host`` and implement ``is_product_url`` (the on-host
    product-page URL shape) and ``resolve`` (the ScraperAPI lookup).
    """

    #: Canonical bare host for the platform (e.g. "www.bestbuy.com").
    host: str

    def host_ok(self, url: str) -> bool:
        """True if ``url``'s host is the platform host or a subdomain of it.

        Same check the price adapters apply before spending a ScraperAPI
        credit (``best_buy.py:135-139`` / ``target.py:119-121``).
        """
        parsed_host = (urlparse(url).hostname or "").lower()
        bare = self.host.removeprefix("www.")
        return parsed_host == self.host or parsed_host.endswith(f".{bare}")

    @abstractmethod
    def is_product_url(self, url: str) -> bool:
        """True if ``url`` is a well-formed product-page URL for this platform."""

    @abstractmethod
    def resolve(self, product_name: str, price_paid: float) -> list[Candidate]:
        """Return ranked candidates (best first) for ``product_name``.

        Synchronous (uses ``requests``); the orchestrator wraps the call in
        ``asyncio.to_thread``. Returns ``[]`` when nothing is found. Raises
        ``ResolveError`` only on a transport failure worth surfacing.
        """
