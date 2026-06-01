"""Product-URL resolver: free-text product name -> on-host product page URL."""

from .base import Candidate, ProductUrlResolver, ResolveError, ResolveResult, Scenario
from .config import MIN_CONFIDENCE, RESOLVABLE_PLATFORMS, get_resolver
from .service import _resolve_and_persist, resolve_product_url

__all__ = [
    "MIN_CONFIDENCE",
    "RESOLVABLE_PLATFORMS",
    "Candidate",
    "ProductUrlResolver",
    "ResolveError",
    "ResolveResult",
    "Scenario",
    "_resolve_and_persist",
    "get_resolver",
    "resolve_product_url",
]
