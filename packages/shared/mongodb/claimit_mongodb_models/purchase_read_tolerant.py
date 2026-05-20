"""Read-tolerant variant of `Purchase` — accept legacy/degraded docs without crashing.

Why this exists, and the strict-on-write contract: see the docstring on
`claim_read_tolerant.ClaimReadTolerant`. Same policy applied to Purchase:
enum fields become `str | None` (verbatim), required scalars are widened
to `T | None`, and numeric / length constraints (`gt=0`, `ge=0`,
`min_length=1`) are dropped.

The known-rogue Purchase from the §3 audit (`category=None`,
`product_name=None`, `claim_type=None`) deserializes cleanly through this
class; the strict `Purchase` model rejects every one of those vectors and
remains the only path used by writes.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .base import BaseDocument


class ExtractionConfidenceReadTolerant(BaseModel):
    """Tolerant counterpart of `ExtractionConfidence`.

    All sub-fields are widened to optional and the [0.0, 1.0] range
    constraints from `Field(ge=0.0, le=1.0)` are dropped — a legacy doc
    with `overall_min=None` (or out-of-range) should still load.
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    platform: float | None = None
    price: float | None = None
    overall_min: float | None = None
    order_id: float | None = None
    product_name: float | None = None
    product_id: float | None = None
    price_paid: float | None = None
    member_price_at_purchase: float | None = None
    purchase_date: float | None = None
    member_tier_at_purchase: float | None = None
    variant: float | None = None
    category: float | None = None


class PurchaseReadTolerant(BaseDocument):
    """Tolerant variant of `Purchase`.

    Field annotations track `Purchase` 1:1 except:

    - All enum-typed fields (`platform`, `category`, `claim_type`,
      `purchase_date_basis`, `status`, `ingestion_source`) are
      `str | None` — verbatim pass-through.
    - All required scalars (`product_name`, `product_id`, `order_id`,
      `price_paid`, `purchase_date`, `window_expires`, `ingested_at`,
      `monitoring_cadence_minutes`, `currency`) are widened to `T | None`.
    - `Field(gt=0)` / `Field(ge=0)` constraints are dropped.
    - `extraction_confidence` is the tolerant sub-model so a malformed
      sub-doc doesn't crash the parent.

    Subclasses `BaseDocument` so the generic `MongoDBClient` read
    helpers accept it directly; `id` is re-declared as optional.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: UUID | None = Field(default=None, alias="_id")
    updated_at: datetime | None = None

    user_id: UUID | None = None
    platform: str | None = None
    category: str | None = None
    product_name: str | None = None
    product_id: str | None = None
    product_url: str | None = None
    variant: str | None = None
    fare_class: str | None = None
    room_type: str | None = None
    bed_type: str | None = None
    rate_type: str | None = None
    price_paid: float | None = None
    member_price_at_purchase: float | None = None
    non_member_price_at_purchase: float | None = None
    currency: str | None = None
    purchase_date: datetime | None = None
    purchase_date_basis: str | None = None
    window_expires: datetime | None = None
    order_id: str | None = None
    member_tier_at_purchase: str | None = None
    status: str | None = None
    claim_type: str | None = None
    monitoring_cadence_minutes: int | None = None
    last_checked_at: datetime | None = None
    ingested_at: datetime | None = None
    ingestion_source: str | None = None
    receipt_storage_url: str | None = None
    receipt_hash: str | None = None
    format_hash: str | None = None
    sender: str | None = None
    extraction_confidence: ExtractionConfidenceReadTolerant | None = None
