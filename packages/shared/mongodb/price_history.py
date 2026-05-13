"""PriceHistory collection — mirror of PriceHistory.ts."""

from .base import BaseDocument
from .enums import PriceSource


class PriceHistory(BaseDocument):
    purchase_id: str
    platform: str
    product_id: str
    price_member: float | None
    price_non_member: float | None
    member_tier_required: str | None
    currency: str
    checked_at: str
    source: PriceSource
    evidence_screenshot_url: str | None
    raw_response_hash: str | None
