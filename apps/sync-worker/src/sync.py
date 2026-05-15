"""MongoDB change-stream → Elasticsearch sync core.

Each registered (collection, index, projection) triple gets a dedicated
`watch_collection` task. The task tails a MongoDB change stream, projects
each `fullDocument` (via `updateLookup`) into the indexed field set, and
writes to Elasticsearch. Resume tokens are persisted to `sync_state` after
every event so a restart picks up exactly where the previous process left
off — Mongo's change-stream cursor recovers from an oplog-resident token.

Reconnect policy: on any unexpected exception the loop logs the failure,
sleeps `_RECONNECT_DELAY_SECONDS`, and re-enters with the last persisted
resume token. `asyncio.CancelledError` (lifespan shutdown) is not caught
because it inherits from `BaseException`, so the `async with` cleanly
closes the cursor and the task exits.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from elasticsearch import AsyncElasticsearch
from motor.motor_asyncio import AsyncIOMotorDatabase

from .projections import (
    project_claim,
    project_policy,
    project_price_history,
    project_purchase,
)

logger = logging.getLogger(__name__)

_SYNC_STATE_COLLECTION = "sync_state"
_RECONNECT_DELAY_SECONDS = 5

ProjectFn = Callable[[dict[str, Any]], dict[str, Any]]

# (mongo collection, es index, projection). Order is preserved for /health.
COLLECTION_INDEX_MAP: list[tuple[str, str, ProjectFn]] = [
    ("purchases", "purchases-search", project_purchase),
    ("claims", "claims-analytics", project_claim),
    ("policies", "policies-fulltext", project_policy),
    ("price_history", "price-history-analytics", project_price_history),
]


async def _load_resume_token(
    db: AsyncIOMotorDatabase, collection_name: str
) -> dict[str, Any] | None:
    """Return the last persisted resume token for `collection_name`, or None."""
    doc = await db[_SYNC_STATE_COLLECTION].find_one({"_id": collection_name})
    return doc["resume_token"] if doc and "resume_token" in doc else None


async def _save_resume_token(
    db: AsyncIOMotorDatabase, collection_name: str, token: dict[str, Any]
) -> None:
    """Upsert the resume token for `collection_name`."""
    await db[_SYNC_STATE_COLLECTION].replace_one(
        {"_id": collection_name},
        {
            "_id": collection_name,
            "resume_token": token,
            "updated_at": datetime.now(UTC),
        },
        upsert=True,
    )


async def _handle_change(
    es: AsyncElasticsearch,
    index_name: str,
    change: dict[str, Any],
    project_fn: ProjectFn,
) -> None:
    """Apply a single change event to Elasticsearch."""
    op_type = change.get("operationType")
    doc_key = change.get("documentKey") or {}
    doc_id_raw = doc_key.get("_id")
    if doc_id_raw is None:
        # Operations like drop/rename/invalidate have no documentKey; skip them.
        logger.warning(
            "Change event without documentKey on index=%s op=%s — skipping",
            index_name,
            op_type,
        )
        return
    doc_id = str(doc_id_raw)

    if op_type in {"insert", "update", "replace"}:
        full_doc = change.get("fullDocument")
        if full_doc is None:
            # Doc was deleted between the change event and the updateLookup.
            logger.info(
                "fullDocument missing on index=%s id=%s op=%s — deleting from ES",
                index_name,
                doc_id,
                op_type,
            )
            await es.options(ignore_status=404).delete(index=index_name, id=doc_id)
            return
        body = project_fn(full_doc)
        await es.index(index=index_name, id=doc_id, document=body)
    elif op_type == "delete":
        await es.options(ignore_status=404).delete(index=index_name, id=doc_id)
    else:
        logger.info(
            "Ignoring change event op=%s on index=%s id=%s",
            op_type,
            index_name,
            doc_id,
        )


async def watch_collection(
    db: AsyncIOMotorDatabase,
    es: AsyncElasticsearch,
    collection_name: str,
    index_name: str,
    project_fn: ProjectFn,
) -> None:
    """Tail `collection_name`'s change stream and mirror each event into `index_name`.

    Runs forever until the surrounding task is cancelled. Recovers across
    network blips by reconnecting with the last persisted resume token.
    """
    while True:
        try:
            token = await _load_resume_token(db, collection_name)
            watch_kwargs: dict[str, Any] = {"full_document": "updateLookup"}
            if token is not None:
                watch_kwargs["resume_after"] = token
            logger.info(
                "Opening change stream collection=%s index=%s resume=%s",
                collection_name,
                index_name,
                "yes" if token else "no",
            )
            async with db[collection_name].watch(**watch_kwargs) as stream:
                async for change in stream:
                    try:
                        await _handle_change(es, index_name, change, project_fn)
                    except Exception:
                        logger.exception(
                            "Non-retryable event failure collection=%s index=%s token=%s",
                            collection_name,
                            index_name,
                            change.get("_id"),
                        )
                    finally:
                        await _save_resume_token(db, collection_name, change["_id"])
        except Exception:
            logger.exception(
                "Change stream error collection=%s index=%s — reconnecting in %ds",
                collection_name,
                index_name,
                _RECONNECT_DELAY_SECONDS,
            )
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)
