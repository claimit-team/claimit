"""Initial backfill from MongoDB collections into Elasticsearch indices.

One-shot script invoked manually (or from CI) to seed the four ES indices
from existing MongoDB data. Pairs with the change-stream sync worker —
backfill handles the historical snapshot, the sync worker handles
go-forward deltas.

For each (mongo_collection, es_index, projection) triple:
  1. stream every document from MongoDB via `collection.find()`
  2. project to the field set indexed by the ES mapping
  3. bulk-index into ES using `str(mongo._id)` as the ES document id

Using the Mongo `_id` as the ES doc id makes the script idempotent: a
re-run replaces existing ES documents rather than creating duplicates, and
documents written by the sync worker after the backfill cleanly overwrite
the backfilled copy (or vice versa) keyed on the same id.

Run with:
    MONGODB_URI=... ELASTIC_URL=... ELASTIC_API_KEY=... \\
        python -m elastic.backfill
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator, Callable
from typing import Any

from elasticsearch import AsyncElasticsearch
from elasticsearch.helpers import async_bulk
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .projections import (
    project_claim,
    project_policy,
    project_price_history,
    project_purchase,
)

logger = logging.getLogger(__name__)

ProjectFn = Callable[[dict[str, Any]], dict[str, Any]]

# (mongo collection, es index, projection). Processed in order.
COLLECTION_INDEX_MAP: list[tuple[str, str, ProjectFn]] = [
    ("purchases", "purchases-search", project_purchase),
    ("claims", "claims-analytics", project_claim),
    ("policies", "policies-fulltext", project_policy),
    ("price_history", "price-history-analytics", project_price_history),
]


async def _iter_actions(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    index_name: str,
    project_fn: ProjectFn,
) -> AsyncIterator[dict[str, Any]]:
    """Yield bulk-API action dicts for every document in the collection."""
    async for doc in db[collection_name].find():
        doc_id = doc.get("_id")
        if doc_id is None:
            logger.warning("Skipping document without _id in collection=%s", collection_name)
            continue
        yield {
            "_op_type": "index",
            "_index": index_name,
            "_id": str(doc_id),
            "_source": project_fn(doc),
        }


async def backfill(
    db: AsyncIOMotorDatabase,
    es: AsyncElasticsearch,
) -> dict[str, dict[str, int]]:
    """Backfill all four collections. Returns per-collection {ok, errors}."""
    results: dict[str, dict[str, int]] = {}
    for collection_name, index_name, project_fn in COLLECTION_INDEX_MAP:
        logger.info("Backfilling collection=%s -> index=%s", collection_name, index_name)
        success_count, error_count = await async_bulk(
            es,
            _iter_actions(db, collection_name, index_name, project_fn),
            raise_on_error=False,
            stats_only=True,
        )
        results[collection_name] = {"ok": success_count, "errors": error_count}
        logger.info(
            "Finished collection=%s: ok=%d errors=%d",
            collection_name,
            success_count,
            error_count,
        )
    return results


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    mongo_uri = os.environ["MONGODB_URI"]
    mongo_db_name = os.environ.get("MONGODB_DB", "claimit")
    elastic_url = os.environ["ELASTIC_URL"]
    elastic_key = os.environ["ELASTIC_API_KEY"]

    mongo_client = AsyncIOMotorClient(mongo_uri)
    db = mongo_client[mongo_db_name]
    es = AsyncElasticsearch(elastic_url, api_key=elastic_key)
    try:
        results = await backfill(db, es)
    finally:
        await es.close()
        mongo_client.close()

    print("=== Backfill summary ===")
    for collection_name, counts in results.items():
        print(f"  {collection_name:>15}: ok={counts['ok']:>6}  errors={counts['errors']:>6}")


if __name__ == "__main__":
    asyncio.run(main())
