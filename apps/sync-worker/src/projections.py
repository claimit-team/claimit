"""Per-collection field projections for the MongoDB → Elastic sync worker.

Each function takes a raw Mongo document (post-`updateLookup`) and returns a
flat dict containing only the fields indexed by the corresponding ES index
(see `packages/shared/elastic/create_indices.py`). Keeping projections in
their own module makes the field set easy to audit against the ES mapping.

UUIDs are stringified — `elasticsearch-py`'s default JSON serializer does
not know how to encode `uuid.UUID`, but ES stores these as `keyword` so a
plain string round-trips faithfully. Datetimes pass through (the serializer
handles them natively).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID


def _stringify_uuid(value: Any) -> Any:
    return str(value) if isinstance(value, UUID) else value


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
