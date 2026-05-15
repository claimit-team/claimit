"""ClaimIt sync worker — MongoDB change-stream → Elasticsearch mirror.

A long-running FastAPI service that watches four MongoDB collections
(`purchases`, `claims`, `policies`, `price_history`) and indexes every
insert/update/replace/delete into the corresponding ES index. The FastAPI
surface exists only for the Cloud Run health probe; the real work happens
in background asyncio tasks spawned in the lifespan.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from elasticsearch import AsyncElasticsearch
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

from .sync import COLLECTION_INDEX_MAP, watch_collection

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    mongo_uri = os.environ["MONGODB_URI"]
    mongo_db_name = os.environ.get("MONGODB_DB", "claimit")
    elastic_url = os.environ["ELASTIC_URL"]
    elastic_key = os.environ["ELASTIC_API_KEY"]

    mongo_client = AsyncIOMotorClient(mongo_uri)
    db = mongo_client[mongo_db_name]
    es = AsyncElasticsearch(elastic_url, api_key=elastic_key)

    tasks: list[asyncio.Task[None]] = []
    for collection_name, index_name, project_fn in COLLECTION_INDEX_MAP:
        task = asyncio.create_task(
            watch_collection(db, es, collection_name, index_name, project_fn),
            name=f"sync:{collection_name}->{index_name}",
        )
        tasks.append(task)
        logger.info("Spawned watcher %s", task.get_name())

    app.state.watcher_tasks = tasks

    try:
        yield
    finally:
        logger.info("Shutdown: cancelling %d watcher tasks", len(tasks))
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await es.close()
        mongo_client.close()


app = FastAPI(
    title="ClaimIt sync worker",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str | int]:
    """Liveness probe — counts watcher tasks that are still alive."""
    tasks: list[asyncio.Task[None]] = getattr(app.state, "watcher_tasks", [])
    alive = sum(1 for t in tasks if not t.done())
    return {"status": "ok", "watchers": alive}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt sync worker is running"}
