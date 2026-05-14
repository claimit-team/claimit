"""Unified search interface for ClaimIt agents.

Thin re-export of the search adapter from packages/shared/elastic/adapter.py.
Per master doc §10 Risk #4, the adapter auto-selects Elastic or Atlas Search.
"""

from elastic.adapter import (
    AtlasSearchAdapter,
    ElasticSearchAdapter,
    SearchAdapter,
    get_search_adapter,
)

__all__ = [
    "AtlasSearchAdapter",
    "ElasticSearchAdapter",
    "SearchAdapter",
    "get_search_adapter",
]
