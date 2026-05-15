"""Unified search interface for ClaimIt agents."""

__all__ = [
    "AtlasSearchAdapter",
    "ElasticSearchAdapter",
    "SearchAdapter",
    "get_search_adapter",
]


def __getattr__(name: str):
    if name in __all__:
        from elastic.adapter import (
            AtlasSearchAdapter,
            ElasticSearchAdapter,
            SearchAdapter,
            get_search_adapter,
        )

        return {
            "AtlasSearchAdapter": AtlasSearchAdapter,
            "ElasticSearchAdapter": ElasticSearchAdapter,
            "SearchAdapter": SearchAdapter,
            "get_search_adapter": get_search_adapter,
        }[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
