"""Pub/Sub event schemas for ClaimIt — Pydantic v2 models with topic constants."""

from typing import Literal

from pydantic import BaseModel, Field

from packages.shared.mongodb.enums import (
    ApprovedBy,
    Category,
    ClaimOutcome,
    ClaimType,
    IngestionSource,
    PurchaseStatus,
    SendMode,
    SubmittedVia,
)

# ---------------------------------------------------------------------------
# Topic / DLQ constants
# ---------------------------------------------------------------------------

PURCHASE_INGESTED_TOPIC = "purchase.ingested"
PURCHASE_INGESTED_DLQ = "purchase.ingested.dlq"

PRICE_DROPPED_TOPIC = "price.dropped"
PRICE_DROPPED_DLQ = "price.dropped.dlq"

CLAIM_DRAFTED_TOPIC = "claim.drafted"
CLAIM_DRAFTED_DLQ = "claim.drafted.dlq"

CLAIM_APPROVED_TOPIC = "claim.approved"
CLAIM_APPROVED_DLQ = "claim.approved.dlq"

CLAIM_RESOLVED_TOPIC = "claim.resolved"
CLAIM_RESOLVED_DLQ = "claim.resolved.dlq"

CLAIM_REDRAFT_REQUESTED_TOPIC = "claim.redraft_requested"
CLAIM_REDRAFT_REQUESTED_DLQ = "claim.redraft_requested.dlq"

# ---------------------------------------------------------------------------
# Event envelope
# ---------------------------------------------------------------------------


class EventEnvelope(BaseModel):
    schema_version: Literal[1] = 1
    event_id: str
    emitted_at: str


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


class PurchaseIngestedEvent(EventEnvelope):
    user_id: str
    purchase_id: str
    platform: str
    category: Category
    status: PurchaseStatus
    ingestion_source: IngestionSource
    overall_confidence: float = Field(ge=0.0, le=1.0)


class PriceDroppedEvent(EventEnvelope):
    user_id: str
    purchase_id: str
    claim_id: str
    platform: str
    refund_amount: float
    currency: str
    detected_price: float
    member_tier_at_purchase: str | None = None
    window_remaining_hours: float
    evidence_snapshot_url: str


class ClaimDraftedEvent(EventEnvelope):
    user_id: str
    claim_id: str
    purchase_id: str
    claim_type: ClaimType
    refund_amount: float
    currency: str
    send_mode: SendMode
    auto_send_at: str | None = None


class ClaimApprovedEvent(EventEnvelope):
    user_id: str
    claim_id: str
    submitted_via: SubmittedVia
    approved_by: ApprovedBy


class ClaimResolvedEvent(EventEnvelope):
    user_id: str
    claim_id: str
    platform: str
    outcome: ClaimOutcome
    outcome_note: str | None = None
    denial_reason_extracted: str | None = None
    refund_amount: float
    currency: str
    days_to_resolution: int


class ClaimRedraftRequestedEvent(EventEnvelope):
    user_id: str
    claim_id: str
    conversation_id: str
    user_instruction: str
