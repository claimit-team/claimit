"""PriceHistory collection — mirror of PriceHistory.ts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from .base import BaseDocument
from .enums import Platform, PriceSource


class PriceHistory(BaseDocument):
    purchase_id: UUID
    platform: Platform
    product_id: str
    price_member: float | None = Field(default=None, ge=0)
    price_non_member: float | None = Field(default=None, ge=0)
    member_tier_required: str | None
    currency: Literal["USD"]
    checked_at: datetime
    source: PriceSource
    evidence_screenshot_url: str | None
    raw_response_hash: str | None
