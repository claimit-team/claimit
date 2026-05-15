"""Purchase collection — mirror of Purchase.ts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from .base import BaseDocument
from .enums import (
    Category,
    ClaimType,
    IngestionSource,
    Platform,
    PurchaseDateBasis,
    PurchaseStatus,
)


class ExtractionConfidence(BaseModel):
    platform: float
    price: float
    overall_min: float


class Purchase(BaseDocument):
    user_id: UUID
    platform: Platform
    category: Category
    product_name: str
    product_id: str
    product_url: str | None
    variant: str | None
    # Category-specific fields. Null for retail; populated for airline/hotel.
    fare_class: str | None
    room_type: str | None
    bed_type: str | None
    rate_type: str | None
    price_paid: float = Field(gt=0)
    member_price_at_purchase: float | None = Field(default=None, ge=0)
    non_member_price_at_purchase: float | None = Field(default=None, ge=0)
    currency: Literal["USD"]
    purchase_date: datetime
    purchase_date_basis: PurchaseDateBasis
    window_expires: datetime
    order_id: str
    member_tier_at_purchase: str | None
    status: PurchaseStatus
    claim_type: ClaimType
    monitoring_cadence_minutes: int
    ingested_at: datetime
    ingestion_source: IngestionSource
    receipt_storage_url: str | None
    receipt_hash: str | None
    extraction_confidence: ExtractionConfidence
