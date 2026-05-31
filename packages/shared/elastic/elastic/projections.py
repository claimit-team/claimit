"""Per-collection field projections for the MongoDB → Elasticsearch pipeline.

Each function takes a raw Mongo document and returns a flat dict containing
only the fields indexed by the corresponding ES index (see `create_indices.py`).
Both the change-stream sync worker (`apps/sync-worker`) and the one-shot
initial backfill (`backfill.py` in this package) share these projections so
the field set indexed by both paths can never drift.

UUIDs are stringified — `elasticsearch-py`'s default JSON serializer can encode
neither `uuid.UUID` NOR `bson.Binary`, but ES stores these as `keyword` so a
plain string round-trips faithfully. Datetimes pass through (the serializer
handles them natively).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID


def _stringify_uuid(value: Any) -> Any:
    """Coerce a UUID-ish value to its canonical string form for ES.

    Motor/PyMongo return UUID fields as `bson.Binary` (subtype 4) under the
    default `uuidRepresentation`, NOT `uuid.UUID` — so handling only `UUID`
    (the previous behaviour) let a raw `Binary` reach `async_bulk`, where
    `elasticsearch-py` raised `SerializationError: Unable to serialize
    Binary(...)` and aborted the whole backfill on the first purchase doc.

    We duck-type `Binary.as_uuid()` rather than importing `bson`, so this module
    stays importable without pymongo. Already-`str` values and non-UUID types
    pass through unchanged.
    """
    if isinstance(value, UUID):
        return str(value)
    # bson.Binary (a bytes subclass) exposes as_uuid(); subtype 4 decodes with
    # the default STANDARD representation.
    as_uuid = getattr(value, "as_uuid", None)
    if callable(as_uuid):
        try:
            return str(as_uuid())
        except Exception:
            # Non-standard subtype or non-UUID Binary: best-effort raw 16-byte
            # decode, else leave it for the caller (don't crash here).
            raw = bytes(value)
            if len(raw) == 16:
                return str(UUID(bytes=raw))
    return value


def project_purchase(doc: dict[str, Any]) -> dict[str, Any]:
    """Project a purchases document down to the `purchases-search` index fields."""
    return {
        "user_id": _stringify_uuid(doc.get("user_id")),
        "platform": doc.get("platform"),
        "product_name": doc.get("product_name"),
        "category": doc.get("category"),
        "status": doc.get("status"),
        "purchase_date": doc.get("purchase_date"),
        "claim_type": doc.get("claim_type"),
        "price_paid": doc.get("price_paid"),
    }


def project_claim(doc: dict[str, Any]) -> dict[str, Any]:
    """Project a claims document down to the `claims-analytics` index fields."""
    return {
        "platform": doc.get("platform"),
        "outcome": doc.get("outcome"),
        "denial_reason_extracted": doc.get("denial_reason_extracted"),
        "claim_amount": doc.get("claim_amount"),
        "submitted_at": doc.get("submitted_at"),
        "resolved_at": doc.get("resolved_at"),
        "outcome_note": doc.get("outcome_note"),
        "user_id": _stringify_uuid(doc.get("user_id")),
    }


def project_policy(doc: dict[str, Any]) -> dict[str, Any]:
    """Project a policies document down to the `policies-fulltext` index fields."""
    return {
        "platform": doc.get("platform"),
        "category": doc.get("category"),
        "policy_text_full": doc.get("policy_text_full"),
        "policy_text_relevant_clause": doc.get("policy_text_relevant_clause"),
        "key_exclusions": doc.get("key_exclusions"),
        "window_days": doc.get("window_days"),
        "covers_own_drops": doc.get("covers_own_drops"),
        "covers_competitor_drops": doc.get("covers_competitor_drops"),
        "claim_type": doc.get("claim_type"),
        "active": doc.get("active"),
    }


def project_price_history(doc: dict[str, Any]) -> dict[str, Any]:
    """Project a price_history document down to the `price-history-analytics` index fields."""
    return {
        "purchase_id": _stringify_uuid(doc.get("purchase_id")),
        "platform": doc.get("platform"),
        "product_id": doc.get("product_id"),
        "price_member": doc.get("price_member"),
        "price_non_member": doc.get("price_non_member"),
        "source": doc.get("source"),
        "checked_at": doc.get("checked_at"),
    }
