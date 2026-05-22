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
from .claim_read_tolerant import ClaimReadTolerant
from .conversation import Conversation
from .notification_event import NotificationEvent
from .policy import Policy
from .price_history import PriceHistory
from .price_history_read_tolerant import PriceHistoryReadTolerant
from .purchase import Purchase
from .purchase_read_tolerant import PurchaseReadTolerant
from .user import User

T = TypeVar("T", bound=BaseDocument)

logger = logging.getLogger(__name__)

# Maps a Mongo collection name to its Pydantic model. Used by `upsert` to
# validate dict inputs against the canonical schema before the write hits
# the database — Pydantic instances are trusted (already validated at
# construction) and bypass this lookup.
#
# IMPORTANT: This map is the WRITE gate. It must always point at the
# STRICT models for `claims` and `purchases`, never at the read-tolerant
# variants. The typed read helpers below (`get_claim`, `get_purchase`,
# `find_claims`, `find_purchases`) deliberately return tolerant instances
# so legacy/degraded docs don't 500 the read paths — but a write that
# happens to round-trip a tolerant instance back through `upsert` would
# still re-validate against the strict class here. That's the
# strict-on-write guarantee.
COLLECTION_MODELS: dict[str, type[BaseDocument]] = {
    "purchases": Purchase,
    "claims": Claim,
    "policies": Policy,
    "users": User,
    "price_history": PriceHistory,
    "conversations": Conversation,
    "notification_events": NotificationEvent,
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
        sort: list[tuple[str, int]] | None = None,
    ) -> list[T]:
        """Return up to `limit` documents matching `filter`."""
        cursor = self._db[collection].find(filter)
        if sort is not None:
            cursor = cursor.sort(sort)
        cursor = cursor.skip(skip).limit(limit)
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

    async def array_push(
        self,
        collection: str,
        id: str | UUID,
        field: str,
        element: BaseDocument | Any,
        element_model: type[Any],
        set_fields: dict[str, Any] | None = None,
        parent_model: type[T] | None = None,
    ) -> bool:
        """Append `element` to the array stored at `field` via Mongo `$push`.

        Why this exists:
            `partial_update` with a full-array `$set` re-validates every
            historical entry against the parent's strict element model.
            For an array of nested sub-models on a long-lived document
            (e.g. `Claim.draft_versions`), a single legacy entry whose
            field-level type drifted (`generated_by` value no longer in
            the current `DraftGeneratedBy` enum) would then fail the
            write — the same class of read-vs-write mismatch the §6
            limitation flagged at top-level scalar granularity.

            `array_push` enforces the principle locked in PR #144 (bot
            fix round 2): "mutating a nested array validates ONLY the
            new element strictly; historical entries are never
            re-validated on write." The new element is validated
            against `element_model` (so a bad new value is still
            rejected — strict-on-new), and the existing array is
            $push'd atomically without being read or rewritten.

            `set_fields` (optional) lets callers atomically pair the
            $push with a sibling-field $set in the same write — e.g.
            keep `Claim.draft_content == draft_versions[-1].content`
            by setting `draft_content` in the same operation. Sibling
            fields are validated against the parent's strict
            annotations via `parent_model` (same gate as
            `partial_update`).

        Returns True on match, False if the document does not exist.
        """
        if set_fields is not None and "_id" in set_fields:
            raise ValueError("`set_fields` may not contain '_id'; identity is fixed by `id`.")

        try:
            # Trust ONLY when the caller already constructed an instance
            # of the exact element_model — `BaseDocument` (or any other
            # broader type) is too wide: an `array_push(field='draft_versions',
            # element=Claim(...), element_model=DraftVersion)` would
            # otherwise skip validation and $push a serialized Claim into
            # the draft_versions array, breaking strict-on-new-data.
            # Anything else (dict, mismatched-type instance, …) goes
            # through `model_validate` so the wrong-type case raises a
            # ValidationError before the DB call.
            if isinstance(element, element_model):
                validated_element = element
            else:
                validated_element = element_model.model_validate(element)
        except ValidationError as exc:
            sanitized = [
                {"loc": e.get("loc"), "type": e.get("type"), "msg": e.get("msg")}
                for e in exc.errors()
            ]
            logger.error(
                "array_push element validation failed for collection=%s field=%s: %s",
                collection,
                field,
                sanitized,
            )
            raise

        if set_fields is not None and parent_model is not None:
            for field_name, value in set_fields.items():
                field_info = parent_model.model_fields.get(field_name)
                if field_info is None:
                    raise ValueError(
                        f"Unknown field {field_name!r} for model {parent_model.__name__}."
                    )
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
                        "array_push set_fields validation failed for collection=%s field=%s: %s",
                        collection,
                        field_name,
                        sanitized,
                    )
                    raise

        if hasattr(validated_element, "model_dump"):
            element_payload: Any = validated_element.model_dump(by_alias=True)
        else:
            element_payload = validated_element

        update_doc: dict[str, Any] = {"$push": {field: element_payload}}
        set_payload: dict[str, Any] = {"updated_at": datetime.now(UTC)}
        if set_fields:
            set_payload.update(set_fields)
        update_doc["$set"] = set_payload

        uid = _coerce_uuid(id)
        result = await self._db[collection].update_one({"_id": uid}, update_doc)
        return result.matched_count > 0

    async def array_push_and_update(
        self,
        collection: str,
        id: str | UUID,
        field: str,
        element: Any,
        element_model: type[Any],
        updates: dict[str, Any],
    ) -> None:
        """Push `element` to an array field and apply `updates` atomically.

        Validates `element` against `element_model` (strict-on-new-data),
        then issues a single `update_one` with both `$push` and `$set` so
        the array append and the sibling-field writes are never split across
        two round-trips (eliminating the TOCTOU window between a separate
        `array_push` + `partial_update` pair).

        `updated_at` is always included in the `$set` payload.
        """
        if "_id" in updates:
            raise ValueError("`updates` may not contain '_id'; identity is fixed by `id`.")

        try:
            if isinstance(element, element_model):
                validated_element = element
            else:
                validated_element = element_model.model_validate(element)
        except ValidationError as exc:
            sanitized = [
                {"loc": e.get("loc"), "type": e.get("type"), "msg": e.get("msg")}
                for e in exc.errors()
            ]
            logger.error(
                "array_push_and_update element validation failed for collection=%s field=%s: %s",
                collection,
                field,
                sanitized,
            )
            raise

        element_payload = validated_element.model_dump(mode="json")
        set_payload: dict[str, Any] = {**updates, "updated_at": datetime.now(UTC)}
        update_doc: dict[str, Any] = {
            "$push": {field: element_payload},
            "$set": set_payload,
        }
        uid = _coerce_uuid(id)
        await self._db[collection].update_one({"_id": uid}, update_doc)

    async def update_many(
        self,
        collection: str,
        filter: dict[str, Any],
        updates: dict[str, Any],
        model: type[T] | None = None,
    ) -> int:
        """Apply a `$set` partial update to every document matching `filter`.

        Counterpart to `partial_update`, but for bulk operations (e.g. "ack
        all unread notifications for this user"). `updated_at` is set
        automatically on every modified document.

        `_id` may not appear in `updates` — bulk-rewriting identities is
        always a bug. Per-field validation is identical to `partial_update`
        when `model` is supplied.

        Returns the number of documents whose contents actually changed
        (`modified_count`). Documents that already matched the new values
        are not counted, which makes the helper naturally idempotent.
        """
        if "_id" in updates:
            raise ValueError(
                "`updates` may not contain '_id'; bulk identity rewrites are not allowed."
            )

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
                        "update_many validation failed for collection=%s field=%s: %s",
                        collection,
                        field_name,
                        sanitized,
                    )
                    raise

        set_payload = {**updates, "updated_at": datetime.now(UTC)}
        result = await self._db[collection].update_many(filter, {"$set": set_payload})
        return result.modified_count

    async def count(self, collection: str, filter: dict[str, Any]) -> int:
        """Count documents matching `filter`."""
        return await self._db[collection].count_documents(filter)

    async def aggregate(
        self,
        collection: str,
        pipeline: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Run an aggregation pipeline against `collection`.

        Returns raw documents because aggregation pipelines can $project
        arbitrary shapes that don't match domain Pydantic models. Callers
        interpret the result shape.

        Example:
            result = await db.aggregate("claims", [
                {"$match": {"user_id": uid}},
                {"$group": {"_id": "$outcome", "total": {"$sum": "$claim_amount"}}},
            ])
        """
        cursor = self._db[collection].aggregate(pipeline)
        return [doc async for doc in cursor]

    async def delete(self, collection: str, id: str | UUID) -> bool:
        """Delete by `_id`. Returns True if exactly one document was deleted."""
        result = await self._db[collection].delete_one({"_id": _coerce_uuid(id)})
        return result.deleted_count > 0

    # ---------- per-collection shortcuts ----------
    # Collection names follow the standard pluralization. Each shortcut is a
    # thin wrapper around the generic helpers above so the caller can stay in
    # typed-Pydantic-land without remembering collection-name strings.

    # ---------- Purchase + Claim typed READS return TOLERANT models ----------
    # The §1 audit (PR #141 follow-up) found eight read sites that 500 when
    # a legacy/degraded doc lives in the user's history. These typed
    # shortcuts default to the read-tolerant variants so callers are
    # auto-safe — the strict `Purchase` / `Claim` classes stay reserved
    # for the WRITE path (the constructor calls in upload/ingest/agents
    # plus `db.upsert("purchases"/"claims", …)` which validates against
    # the strict `COLLECTION_MODELS` entries above).

    async def get_purchase(self, id: str | UUID) -> PurchaseReadTolerant | None:
        return await self.get("purchases", id, PurchaseReadTolerant)

    async def upsert_purchase(self, purchase: Purchase) -> str:
        # Param annotation stays strict — only fully-validated Purchase
        # instances should be written. Read-tolerant instances must NOT
        # round-trip back through writes.
        return await self.upsert("purchases", purchase.id, purchase)

    async def find_purchases(
        self, filter: dict[str, Any], limit: int = 100
    ) -> list[PurchaseReadTolerant]:
        return await self.find_many("purchases", filter, PurchaseReadTolerant, limit=limit)

    async def get_claim(self, id: str | UUID) -> ClaimReadTolerant | None:
        return await self.get("claims", id, ClaimReadTolerant)

    async def upsert_claim(self, claim: Claim) -> str:
        return await self.upsert("claims", claim.id, claim)

    async def find_claims(
        self,
        filter: dict[str, Any],
        limit: int = 100,
        sort: list[tuple[str, int]] | None = None,
    ) -> list[ClaimReadTolerant]:
        return await self.find_many("claims", filter, ClaimReadTolerant, limit=limit, sort=sort)

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
        """Persist a price-history record (upsert keyed on `_id`).

        Param stays strict — only fully-validated `PriceHistory` instances
        should be written. Read-tolerant instances must NOT round-trip back
        through writes (would silently relax write validation and defeat
        the strict-write guarantee enforced via `COLLECTION_MODELS`).
        """
        return await self.upsert("price_history", record.id, record)

    async def find_price_history(
        self,
        purchase_id: str | UUID,
        limit: int = 100,
        sort: list[tuple[str, int]] | None = None,
    ) -> list[PriceHistoryReadTolerant]:
        """List the price-history snapshots for a purchase.

        Returns `PriceHistoryReadTolerant` instances so a single legacy row
        (e.g. one with a `source` value the current `PriceSource` enum no
        longer recognises, or a missing `currency`) doesn't 500 callers
        that iterate the result. Write path is unaffected —
        `insert_price_history` and `COLLECTION_MODELS["price_history"]`
        stay on the strict `PriceHistory` class.
        """
        return await self.find_many(
            "price_history",
            {"purchase_id": _coerce_uuid(purchase_id)},
            PriceHistoryReadTolerant,
            limit=limit,
            sort=sort,
        )

    async def get_conversation(self, id: str | UUID) -> Conversation | None:
        return await self.get("conversations", id, Conversation)

    async def upsert_conversation(self, conv: Conversation) -> str:
        return await self.upsert("conversations", conv.id, conv)

    async def upsert_notification_event(self, doc: NotificationEvent) -> str:
        return await self.upsert("notification_events", doc.id, doc)


def _coerce_uuid(value: str | UUID) -> UUID:
    """Accept either a UUID instance or a str for id-based queries."""
    return value if isinstance(value, UUID) else UUID(value)
