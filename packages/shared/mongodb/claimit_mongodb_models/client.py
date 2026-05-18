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
from datetime import UTC, datetime
from typing import Annotated, Any, TypeVar
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import TypeAdapter, ValidationError

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
        # uuidRepresentation="standard" -> BSON Binary subtype 4 (RFC 4122).
        # Required for pymongo 4.x to round-trip native uuid.UUID; the default
        # UNSPECIFIED rejects UUID writes/queries. "standard" is cross-language
        # interoperable and the project's chosen representation.
        self._client: AsyncIOMotorClient = AsyncIOMotorClient(
            connection_uri,
            uuidRepresentation="standard",
        )
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

        The `id` arg, `document.id` (for Pydantic input), and `document["_id"]`
        (for dict input) must all agree — a mismatch raises `ValueError` rather
        than silently overwriting an unrelated document.

        `updated_at` is set automatically to the current UTC time before the
        write; callers do not need to provide it.

        Schema validation:
        - Pydantic `BaseDocument` instances are trusted (already validated at
          construction) and pass through.
        - dict inputs are validated against `COLLECTION_MODELS[collection]`
          via `model_validate` before the write. Field-level errors are logged
          and `pydantic.ValidationError` propagates to the caller — no write
          is attempted on invalid input.
        """
        model_cls = COLLECTION_MODELS.get(collection)
        if model_cls is None:
            raise ValueError(
                f"No Pydantic model registered for collection {collection!r}; "
                "register the model in COLLECTION_MODELS."
            )

        uid = _coerce_uuid(id)

        if isinstance(document, BaseDocument):
            if not isinstance(document, model_cls):
                raise ValueError(
                    f"Model/collection mismatch: cannot write "
                    f"{type(document).__name__} instance to collection "
                    f"{collection!r} (expects {model_cls.__name__})."
                )
            if document.id is not None and document.id != uid:
                raise ValueError(
                    f"_id mismatch: id arg {uid} does not match document.id "
                    f"{document.id}; refusing to overwrite a different document."
                )
            validated: BaseDocument = document
        else:
            doc_id = document.get("_id")
            if doc_id is not None and _coerce_uuid(doc_id) != uid:
                raise ValueError(
                    f"_id mismatch: id arg {uid} does not match document['_id'] "
                    f"{doc_id}; refusing to overwrite a different document."
                )
            try:
                validated = model_cls.model_validate(document)
            except ValidationError as exc:
                sanitized = [
                    {"loc": e.get("loc"), "type": e.get("type"), "msg": e.get("msg")}
                    for e in exc.errors()
                ]
                logger.error(
                    "Schema validation failed for collection=%s: %s",
                    collection,
                    sanitized,
                )
                raise

        payload = validated.model_dump(by_alias=True)
        payload["_id"] = uid
        payload["updated_at"] = datetime.now(UTC)
        await self._db[collection].replace_one({"_id": uid}, payload, upsert=True)
        return str(uid)

    async def partial_update(
        self,
        collection: str,
        id: str | UUID,
        updates: dict[str, Any],
        model: type[T] | None = None,
    ) -> bool:
        """Apply a `$set` partial update to a single document by `_id`.

        `updated_at` is always set to the current UTC time and `_id` may not
        appear in `updates` (identity is taken from the `id` arg).

        If `model` is supplied, each field in `updates` is validated against
        its model field annotation (including `Field(...)` constraints) before
        the write. Field-level errors are logged and `ValidationError`
        propagates — no write is attempted. Unknown field names raise
        `ValueError`.

        Returns True if exactly one document matched the filter, False
        otherwise (the document does not exist). Use `upsert` to insert.
        """
        if "_id" in updates:
            raise ValueError("`updates` may not contain '_id'; identity is fixed by `id`.")

        if model is not None:
            for field_name, value in updates.items():
                field_info = model.model_fields.get(field_name)
                if field_info is None:
                    raise ValueError(f"Unknown field {field_name!r} for model {model.__name__}.")
                annotation = field_info.annotation
                if field_info.metadata:
                    annotation = Annotated[(annotation, *field_info.metadata)]
                try:
                    TypeAdapter(annotation).validate_python(value)
                except ValidationError as exc:
                    sanitized = [
                        {"loc": (field_name,), "type": e.get("type"), "msg": e.get("msg")}
                        for e in exc.errors()
                    ]
                    logger.error(
                        "Partial-update validation failed for collection=%s field=%s: %s",
                        collection,
                        field_name,
                        sanitized,
                    )
                    raise

        uid = _coerce_uuid(id)
        set_payload = {**updates, "updated_at": datetime.now(UTC)}
        result = await self._db[collection].update_one({"_id": uid}, {"$set": set_payload})
        return result.matched_count > 0

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
