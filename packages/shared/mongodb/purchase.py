"""Purchase collection — mirror of Purchase.ts."""

from pydantic import BaseModel

from .base import BaseDocument
from .enums import (
    Category,
    ClaimType,
    IngestionSource,
    PurchaseDateBasis,
    PurchaseStatus,
)


class ExtractionConfidence(BaseModel):
    platform: float
    price: float
    overall_min: float


class Purchase(BaseDocument):
    user_id: str
    platform: str
    category: Category
    product_name: str
    product_id: str
    product_url: str | None
    variant: str | None
    fare_class: str | None
    room_type: str | None
    bed_type: str | None
    rate_type: str | None
    price_paid: float
    member_price_at_purchase: float | None
    non_member_price_at_purchase: float | None
    currency: str
    purchase_date: str
    purchase_date_basis: PurchaseDateBasis
    window_expires: str
    order_id: str
    member_tier_at_purchase: str | None
    status: PurchaseStatus
    claim_type: ClaimType
    monitoring_cadence_minutes: int
    ingested_at: str
    ingestion_source: IngestionSource
    receipt_storage_url: str | None
    receipt_hash: str | None
    extraction_confidence: ExtractionConfidence
