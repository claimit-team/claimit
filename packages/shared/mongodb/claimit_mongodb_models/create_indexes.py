"""Idempotent MongoDB index creation for ClaimIt.

Creates indexes for 7 collections per master doc §7.3. Safe to run multiple
times — MongoDB's createIndex is a no-op when the requested spec matches an
existing index, and raises OperationFailure only when options conflict.
"""

import asyncio
import os
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import OperationFailure

INDEX_DEFINITIONS: dict[str, list[dict[str, Any]]] = {
    "users": [
        {"keys": [("email", 1)], "unique": True},
        {"keys": [("gmail_integration.watch_expires_at", 1)]},
    ],
    "purchases": [
        {"keys": [("user_id", 1), ("status", 1)]},
        {"keys": [("window_expires", 1)]},
        # Partial unique on the (user_id, platform, order_id) triple.
        # Real purchases are still deduped — the constraint fires for
        # any non-empty `order_id`. The api-gateway upload sentinel
        # AND the extraction-failure rescue path both write
        # `order_id=""` (no id to extract yet); without the partial
        # filter a second upload from the same user collides on
        # (user_id, "amazon", "") because the sentinel default
        # platform is amazon, and Mongo returns DuplicateKeyError →
        # 500 from the upload endpoint. The partial keeps real-
        # purchase dedup intact and lets sentinels / rescued docs
        # stack until each gets its real `order_id` from finalize.
        # NOTE on dedup semantics for downstream consumers: this
        # partial allows multiple (user_id, platform, "") rows AND
        # multiple (user_id, platform, null) rows — but the strict
        # `Purchase` model declares `order_id: str` (non-null,
        # required), so null is a non-issue for prod-written docs.
        {
            "keys": [("user_id", 1), ("platform", 1), ("order_id", 1)],
            "unique": True,
            "partialFilterExpression": {"order_id": {"$gt": ""}},
        },
        # Partial unique: only indexes documents with a string receipt_hash so
        # multiple null/missing hashes are allowed.
        {
            "keys": [("receipt_hash", 1)],
            "unique": True,
            "partialFilterExpression": {"receipt_hash": {"$type": "string"}},
        },
    ],
    "price_history": [
        {"keys": [("purchase_id", 1), ("checked_at", -1)]},
        {"keys": [("checked_at", 1)], "expireAfterSeconds": 7776000},
    ],
    "policies": [
        {"keys": [("platform", 1)], "unique": True},
        {"keys": [("active", 1), ("category", 1)]},
    ],
    "claims": [
        {"keys": [("user_id", 1), ("outcome", 1)]},
        {"keys": [("platform", 1), ("outcome", 1)]},
        {"keys": [("purchase_id", 1)]},
    ],
    "conversations": [
        {"keys": [("user_id", 1), ("status", 1), ("last_message_at", -1)]},
        {"keys": [("claim_id", 1)]},
    ],
    "notification_events": [
        {"keys": [("user_id", 1), ("created_at", -1)]},
        {"keys": [("user_id", 1), ("acknowledged", 1), ("created_at", -1)]},
        {"keys": [("entity_id", 1)], "sparse": True},
    ],
}


async def create_indexes(
    mongo_uri: str | None = None,
    db_name: str | None = None,
) -> dict[str, list[str]]:
    """Create indexes for all collections. Returns {collection: [index_names]}."""
    uri = mongo_uri if mongo_uri is not None else os.environ.get("MONGODB_URI")
    if not uri:
        raise ValueError("MONGODB_URI must be set or passed via mongo_uri arg.")

    database = db_name if db_name is not None else os.environ.get("MONGODB_DB", "claimit")

    client: AsyncIOMotorClient = AsyncIOMotorClient(uri)
    try:
        db = client[database]
        result: dict[str, list[str]] = {}
        for collection_name, specs in INDEX_DEFINITIONS.items():
            collection = db[collection_name]
            created: list[str] = []
            for spec in specs:
                keys = spec["keys"]
                kwargs = {k: v for k, v in spec.items() if k != "keys"}
                try:
                    name = await collection.create_index(keys, **kwargs)
                except OperationFailure as exc:
                    # OperationFailure code 85 = IndexOptionsConflict (an
                    # index with the same name/keys exists but with
                    # different options — e.g. `unique:True` without our
                    # new `partialFilterExpression`), code 86 =
                    # IndexKeySpecsConflict. In both cases the old shape
                    # is incompatible with what we want; drop and
                    # recreate to converge the live schema with
                    # INDEX_DEFINITIONS. Idempotent: re-running this
                    # script after the drop-and-recreate is a no-op
                    # because the second `create_index` matches the
                    # existing spec.
                    code = getattr(exc, "code", None)
                    if (
                        collection_name == "purchases"
                        and keys == [("receipt_hash", 1)]
                        and code in (85, 86)
                    ):
                        await collection.drop_index("receipt_hash_1")
                        name = await collection.create_index(keys, **kwargs)
                    elif (
                        # Post-5.14 prod-verify: pre-fix the (user_id,
                        # platform, order_id) triple was a plain unique
                        # index; this PR converts it to a partial unique
                        # filtered on `order_id > ""` so the upload
                        # sentinel and rescue path can coexist. Drop the
                        # old index name (Mongo's auto-derived
                        # `user_id_1_platform_1_order_id_1`) and recreate
                        # with the partial filter.
                        collection_name == "purchases"
                        and keys == [("user_id", 1), ("platform", 1), ("order_id", 1)]
                        and code in (85, 86)
                    ):
                        await collection.drop_index("user_id_1_platform_1_order_id_1")
                        name = await collection.create_index(keys, **kwargs)
                    else:
                        raise
                created.append(name)
            result[collection_name] = created
        return result
    finally:
        client.close()


if __name__ == "__main__":
    result = asyncio.run(create_indexes())
    for collection_name, index_names in result.items():
        print(f"\n{collection_name}:")
        for index_name in index_names:
            print(f"  ✓ {index_name}")
    total = sum(len(v) for v in result.values())
    print(f"\nCreated {total} indexes across {len(result)} collections.")
