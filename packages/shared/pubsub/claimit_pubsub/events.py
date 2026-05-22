"""Pub/Sub event schemas.

Mirrors Attachment 2 §2. Each event extends `EventEnvelope` and is serialized
to JSON for publication. The `Literal` types intentionally duplicate the
string values in `claimit_mongodb_models.enums` rather than importing them —
this keeps the package free of a Mongo dependency. Keep the two sources in
sync if either side changes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

TOPIC_PURCHASE_INGESTED = "purchase.ingested"
TOPIC_PRICE_DROPPED = "price.dropped"
# Ticket 5.14: api-gateway publishes `purchase.uploaded` after writing the
# sentinel pending_confirmation Purchase + uploading the receipt blob to
# GCS. The ingest-agent's purchase.uploaded Pub/Sub-push handler subscribes,
# fetches the blob, runs `extract_from_blob`, and calls
# `finalize_purchase_extraction` which then publishes `purchase.ingested`
# (i.e. this is strictly an upstream event of the existing pipeline).
TOPIC_PURCHASE_UPLOADED = "purchase.uploaded"
TOPIC_CLAIM_REDRAFT_REQUESTED = "claim.redraft_requested"


def _new_event_id() -> str:
    return str(uuid4())


def _now_utc() -> datetime:
    return datetime.now(UTC)


class EventEnvelope(BaseModel):
    """Common envelope for every ClaimIt Pub/Sub event."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    event_id: str = Field(default_factory=_new_event_id)
    emitted_at: AwareDatetime = Field(default_factory=_now_utc)


class PurchaseIngestedEvent(EventEnvelope):
    """Published by the ingest-agent after a purchase is persisted."""

    event_type: Literal["purchase.ingested"] = "purchase.ingested"
    user_id: str
    purchase_id: str
    platform: str
    category: Literal["retail", "airline", "hotel"]
    status: Literal["monitoring", "pending_confirmation"]
    ingestion_source: Literal["gmail", "upload_pdf", "upload_image"]
    overall_confidence: float = Field(ge=0.0, le=1.0)


class PriceDroppedEvent(EventEnvelope):
    """Published by the monitor-agent when an eligible drop is detected.

    Mirrors Attachment 2 §2.2. Subscribers: Claim Agent (draft generation).
    """

    event_type: Literal["price.dropped"] = "price.dropped"
    user_id: str
    purchase_id: str
    platform_id: str
    claim_id: str
    original_price: float = Field(gt=0)
    current_price: float = Field(ge=0)
    price_drop_amount: float = Field(gt=0)
    price_drop_pct: float = Field(gt=0)
    purchase_date: AwareDatetime
    detected_at: AwareDatetime
    currency: Literal["USD"] = "USD"


class PurchaseUploadedEvent(EventEnvelope):
    """Published by api-gateway after a user uploads a receipt (ticket 5.14).

    The ingest-agent subscribes and runs vision extraction against the
    referenced GCS blob. The payload deliberately carries ONLY identifiers
    + the storage URL — the ingest-agent re-reads the purchase doc to pick
    up the receipt metadata (content_type, ingestion_source) it stored on
    upload, so the event stays small and immutable to schema-additive
    changes in the Purchase model.
    """

    event_type: Literal["purchase.uploaded"] = "purchase.uploaded"
    user_id: str
    purchase_id: str
    receipt_storage_url: str
    content_type: Literal["application/pdf", "image/png", "image/jpeg"]


class ClaimRedraftRequestedEvent(EventEnvelope):
    """Published by the Assistant Agent (Mode B) when a user asks for a redraft.

    Ticket 3.23. Subscriber: claim-agent (handler ships in ticket 3.21).
    `feedback` is the natural-language steer ("make it friendlier", "shorter",
    etc.) the user gave; the claim-agent generator consumes it to bias the
    next draft. `requested_by` distinguishes assistant-mediated redrafts
    from a hypothetical direct-from-user trigger so the receiver can apply
    different rate limits or routing if needed.
    """

    event_type: Literal["claim.redraft_requested"] = "claim.redraft_requested"
    user_id: str
    claim_id: str
    feedback: str = Field(min_length=1, max_length=500)
    requested_by: Literal["assistant", "user"] = "assistant"
