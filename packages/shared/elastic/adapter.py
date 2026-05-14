"""Elastic search adapter with MCP-first, Atlas Search fallback.

Per master doc §10 Risk #4: Elastic MCP may not be production-ready.
Both paths expose identical interface so agents don't care which backend runs.
"""

import os
from abc import ABC, abstractmethod
from typing import Any


class SearchAdapter(ABC):
    """Common interface for policy and purchase search."""

    @abstractmethod
    async def search_policies(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        """Full-text search over policies collection."""
        ...

    @abstractmethod
    async def search_purchases(
        self, user_id: str, query: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        """User-scoped natural language search over purchases."""
        ...

    @abstractmethod
    async def aggregate_claims(self, platform: str | None = None) -> dict[str, Any]:
        """Claim outcome aggregations for the Learn step."""
        ...

    @abstractmethod
    async def close(self) -> None: ...


class ElasticSearchAdapter(SearchAdapter):
    """Primary: queries Elasticsearch indices created by 2.7."""

    def __init__(self) -> None:
        from elasticsearch import AsyncElasticsearch

        self._es = AsyncElasticsearch(
            os.environ["ELASTIC_URL"],
            api_key=os.environ["ELASTIC_API_KEY"],
        )

    async def search_policies(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        result = await self._es.search(
            index="policies-fulltext",
            query={
                "multi_match": {
                    "query": query,
                    "fields": [
                        "policy_text_full",
                        "policy_text_relevant_clause",
                        "platform",
                    ],
                }
            },
            size=limit,
        )
        return [hit["_source"] for hit in result["hits"]["hits"]]

    async def search_purchases(
        self, user_id: str, query: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        result = await self._es.search(
            index="purchases-search",
            query={
                "bool": {
                    "must": [{"match": {"product_name": query}}],
                    "filter": [{"term": {"user_id": user_id}}],
                }
            },
            size=limit,
        )
        return [hit["_source"] for hit in result["hits"]["hits"]]

    async def aggregate_claims(self, platform: str | None = None) -> dict[str, Any]:
        query: dict[str, Any] = {"match_all": {}}
        if platform:
            query = {"term": {"platform": platform}}
        result = await self._es.search(
            index="claims-analytics",
            query=query,
            aggs={
                "by_outcome": {"terms": {"field": "outcome"}},
                "avg_amount": {"avg": {"field": "claim_amount"}},
            },
            size=0,
        )
        aggs = result.get("aggregations", {})
        buckets = aggs.get("by_outcome", {}).get("buckets", [])
        avg_value = aggs.get("avg_amount", {}).get("value")
        return {
            "by_outcome": {b["key"]: b["doc_count"] for b in buckets},
            "avg_amount": avg_value if avg_value is not None else 0,
        }

    async def close(self) -> None:
        await self._es.close()


class AtlasSearchAdapter(SearchAdapter):
    """Fallback: uses MongoDB Atlas Search (same Lucene engine under the hood)."""

    def __init__(self) -> None:
        from motor.motor_asyncio import AsyncIOMotorClient

        uri = os.environ.get("MONGODB_URI", "")
        if not uri:
            raise ValueError("MONGODB_URI required for Atlas Search fallback")
        self._client = AsyncIOMotorClient(uri)
        self._db = self._client["claimit"]

    async def search_policies(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        pipeline = [
            {
                "$search": {
                    "text": {
                        "query": query,
                        "path": [
                            "policy_text_full",
                            "policy_text_relevant_clause",
                            "platform",
                        ],
                    }
                }
            },
            {"$limit": limit},
            {
                "$project": {
                    "_id": 0,
                    "platform": 1,
                    "policy_text_full": 1,
                    "policy_text_relevant_clause": 1,
                    "key_exclusions": 1,
                    "claim_type": 1,
                }
            },
        ]
        return [doc async for doc in self._db["policies"].aggregate(pipeline)]

    async def search_purchases(
        self, user_id: str, query: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        pipeline = [
            {
                "$search": {
                    "compound": {
                        "must": [{"text": {"query": query, "path": "product_name"}}],
                        "filter": [{"equals": {"path": "user_id", "value": user_id}}],
                    }
                }
            },
            {"$limit": limit},
            {
                "$project": {
                    "_id": 0,
                    "platform": 1,
                    "product_name": 1,
                    "category": 1,
                    "status": 1,
                    "price_paid": 1,
                    "purchase_date": 1,
                }
            },
        ]
        return [doc async for doc in self._db["purchases"].aggregate(pipeline)]

    async def aggregate_claims(self, platform: str | None = None) -> dict[str, Any]:
        pipeline: list[dict[str, Any]] = []
        if platform:
            pipeline.append({"$match": {"platform": platform}})
        pipeline.append(
            {
                "$facet": {
                    "by_outcome": [{"$group": {"_id": "$outcome", "count": {"$sum": 1}}}],
                    "overall": [
                        {
                            "$group": {
                                "_id": None,
                                "avg_amount": {"$avg": "$claim_amount"},
                            }
                        }
                    ],
                }
            }
        )
        results = [doc async for doc in self._db["claims"].aggregate(pipeline)]
        data = results[0] if results else {}
        overall = data.get("overall", [])
        avg = overall[0].get("avg_amount") if overall else None
        return {
            "by_outcome": {r["_id"]: r["count"] for r in data.get("by_outcome", [])},
            "avg_amount": avg if avg is not None else 0,
        }

    async def close(self) -> None:
        self._client.close()


def get_search_adapter() -> SearchAdapter:
    """Factory: returns Elastic adapter if configured, otherwise Atlas Search fallback."""
    elastic_url = os.environ.get("ELASTIC_URL")
    elastic_key = os.environ.get("ELASTIC_API_KEY")
    if elastic_url and elastic_key:
        return ElasticSearchAdapter()
    return AtlasSearchAdapter()
