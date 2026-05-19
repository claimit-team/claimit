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
