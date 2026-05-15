"""Async MongoDB client + typed CRUD helpers for ClaimIt collections.

Wraps motor's `AsyncIOMotorClient` with thin generic methods that round-trip
Pydantic `BaseDocument` subclasses to/from BSON. The motor client is lazy —
no TCP connection is opened until the first awaited operation, so building
the wrapper at module-import time is safe.

BSON ↔ Pydantic conventions:
- Writes use `model.model_dump(by_alias=True)`, which emits the `_id` alias and
  preserves native types (UUID, datetime, StrEnum-derived enums). pymongo
  stores them as their native BSON types.
- Reads use `model.model_validate(doc)`. Pydantic's `populate_by_name=True`
  config on `BaseDocument` accepts the `_id` key.
"""

from __future__ import annotations

import logging
import os
from typing import Any, TypeVar
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import ValidationError

from .base import BaseDocument
from .claim import Claim
from .conversation import Conversation
from .policy import Policy
from .price_history import PriceHistory
from .purchase import Purchase
from .user import User

T = TypeVar("T", bound=BaseDocument)

logger = logging.getLogger(__name__)

# Maps a Mongo collection name to its Pydantic model. Used by `upsert` to
# validate dict inputs against the canonical schema before the write hits
# the database — Pydantic instances are trusted (already validated at
# construction) and bypass this lookup.
COLLECTION_MODELS: dict[str, type[BaseDocument]] = {
    "purchases": Purchase,
    "claims": Claim,
    "policies": Policy,
    "users": User,
    "price_history": PriceHistory,
    "conversations": Conversation,
}


class MongoDBClient:
    """Thin async wrapper around motor with typed Pydantic CRUD.

    motor's `AsyncIOMotorClient` is lazy — the TCP connection is established on
    the first awaitable operation. Instantiating this class is therefore cheap
    and safe in module-level code.
    """

    def __init__(self, uri: str | None = None, database: str = "claimit") -> None:
        connection_uri = uri if uri is not None else os.environ.get("MONGODB_URI")
        if not connection_uri:
            raise ValueError("MongoDB URI not provided and MONGODB_URI env var is not set.")
        self._client: AsyncIOMotorClient = AsyncIOMotorClient(connection_uri)
        self._db: AsyncIOMotorDatabase = self._client[database]

    async def close(self) -> None:
        """Close the underlying motor connection pool."""
        self._client.close()

    # ---------- generic CRUD ----------

    async def get(self, collection: str, id: str | UUID, model: type[T]) -> T | None:
        """Fetch a single document by its `_id` and validate it against `model`."""
        doc = await self._db[collection].find_one({"_id": _coerce_uuid(id)})
        return model.model_validate(doc) if doc else None

    async def find_one(self, collection: str, filter: dict[str, Any], model: type[T]) -> T | None:
        """Return the first document matching `filter`, validated against `model`."""
        doc = await self._db[collection].find_one(filter)
        return model.model_validate(doc) if doc else None

    async def find_many(
        self,
        collection: str,
        filter: dict[str, Any],
        model: type[T],
        limit: int = 100,
        skip: int = 0,
    ) -> list[T]:
        """Return up to `limit` documents matching `filter`."""
        cursor = self._db[collection].find(filter).skip(skip).limit(limit)
        return [model.model_validate(doc) async for doc in cursor]

    async def upsert(
        self,
        collection: str,
        id: str | UUID,
        document: BaseDocument | dict[str, Any],
    ) -> str:
        """Replace-or-insert by `_id`. Returns the persisted `_id` as a string.

        The persisted `_id` is taken from the `id` arg, not from `document.id`,
        so callers can rename / re-key a document if they want. Typical callers
        pass `document.id`.

        Schema validation:
        - Pydantic `BaseDocument` instances are trusted (already validated at
          construction) and pass through.
        - dict inputs are validated against `COLLECTION_MODELS[collection]`
          via `model_validate` before the write. Field-level errors are logged
          and `pydantic.ValidationError` propagates to the caller — no write
          is attempted on invalid input.
        """
        if isinstance(document, BaseDocument):
            validated: BaseDocument = document
        else:
            model_cls = COLLECTION_MODELS.get(collection)
            if model_cls is None:
                raise ValueError(
                    f"No Pydantic model registered for collection {collection!r}; "
                    "pass a BaseDocument instance or register the model in "
                    "COLLECTION_MODELS."
                )
            try:
                validated = model_cls.model_validate(document)
            except ValidationError as exc:
                logger.error(
                    "Schema validation failed for collection=%s: %s",
                    collection,
                    exc.errors(),
                )
                raise

        uid = _coerce_uuid(id)
        payload = validated.model_dump(by_alias=True)
        payload["_id"] = uid
        await self._db[collection].replace_one({"_id": uid}, payload, upsert=True)
        return str(uid)

    async def count(self, collection: str, filter: dict[str, Any]) -> int:
        """Count documents matching `filter`."""
        return await self._db[collection].count_documents(filter)

    async def delete(self, collection: str, id: str | UUID) -> bool:
        """Delete by `_id`. Returns True if exactly one document was deleted."""
        result = await self._db[collection].delete_one({"_id": _coerce_uuid(id)})
        return result.deleted_count > 0

    # ---------- per-collection shortcuts ----------
    # Collection names follow the standard pluralization. Each shortcut is a
    # thin wrapper around the generic helpers above so the caller can stay in
    # typed-Pydantic-land without remembering collection-name strings.

    async def get_purchase(self, id: str | UUID) -> Purchase | None:
        return await self.get("purchases", id, Purchase)

    async def upsert_purchase(self, purchase: Purchase) -> str:
        return await self.upsert("purchases", purchase.id, purchase)

    async def find_purchases(self, filter: dict[str, Any], limit: int = 100) -> list[Purchase]:
        return await self.find_many("purchases", filter, Purchase, limit=limit)

    async def get_claim(self, id: str | UUID) -> Claim | None:
        return await self.get("claims", id, Claim)

    async def upsert_claim(self, claim: Claim) -> str:
        return await self.upsert("claims", claim.id, claim)

    async def find_claims(self, filter: dict[str, Any], limit: int = 100) -> list[Claim]:
        return await self.find_many("claims", filter, Claim, limit=limit)

    async def get_policy(self, platform: str) -> Policy | None:
        """Fetch the active policy for a given platform (find_one by platform)."""
        return await self.find_one("policies", {"platform": platform, "active": True}, Policy)

    async def find_policies(self, filter: dict[str, Any]) -> list[Policy]:
        return await self.find_many("policies", filter, Policy)

    async def get_user(self, id: str | UUID) -> User | None:
        return await self.get("users", id, User)

    async def upsert_user(self, user: User) -> str:
        return await self.upsert("users", user.id, user)

    async def insert_price_history(self, record: PriceHistory) -> str:
        """Persist a price-history record (upsert keyed on `_id`)."""
        return await self.upsert("price_history", record.id, record)

    async def find_price_history(
        self, purchase_id: str | UUID, limit: int = 100
    ) -> list[PriceHistory]:
        return await self.find_many(
            "price_history",
            {"purchase_id": _coerce_uuid(purchase_id)},
            PriceHistory,
            limit=limit,
        )

    async def get_conversation(self, id: str | UUID) -> Conversation | None:
        return await self.get("conversations", id, Conversation)

    async def upsert_conversation(self, conv: Conversation) -> str:
        return await self.upsert("conversations", conv.id, conv)


def _coerce_uuid(value: str | UUID) -> UUID:
    """Accept either a UUID instance or a str for id-based queries."""
    return value if isinstance(value, UUID) else UUID(value)
