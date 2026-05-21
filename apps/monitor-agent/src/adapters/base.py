"""Abstract base class for all price source adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass(frozen=True)
class PriceSnapshot:
    """A single price observation returned by any adapter.

    The trailing optional fields (`is_bundle`, `is_on_sale`, and the
    category-specific class fields) are signals consumed by the
    eligibility validator (ticket 3.11). They default to `None` = "the
    adapter didn't detect this." The validator only fires its
    corresponding check when the adapter supplies a concrete signal —
    `None` is treated as "unknown, pass through" so eligibility decisions
    do not silently flip as adapters gain detection capability.
    """

    platform: str
    product_id: str
    price_member: float | None
    price_non_member: float | None
    member_tier_required: str | None
    currency: Literal["USD"]
    checked_at: datetime
    source: str
    evidence_screenshot_url: str | None = None
    raw_response_hash: str | None = None
    is_bundle: bool | None = None
    is_on_sale: bool | None = None
    fare_class: str | None = None
    room_type: str | None = None
    bed_type: str | None = None
    rate_type: str | None = None


class PriceSourceAdapter(ABC):
    """Interface all price source adapters must implement.

    Subclasses: SeededAdapter, BestBuyAdapter, HiltonAdapter,
    SouthwestAdapter, etc.
    """

    @abstractmethod
    async def fetch_current_price(
        self,
        platform: str,
        product_id: str,
        product_url: str | None = None,
        member_tier: str | None = None,
    ) -> PriceSnapshot:
        """Fetch the current price for a product.

        Args:
            platform: Platform identifier (e.g., "best_buy").
            product_id: SKU, ASIN, flight number, or hotel ID.
            product_url: Direct URL to the product page (optional).
            member_tier: User's membership tier for tier-aware pricing.

        Returns:
            PriceSnapshot with current price data.

        Raises:
            PriceFetchError: If the price cannot be retrieved.
        """


class PriceFetchError(Exception):
    """Raised when a price source adapter cannot retrieve the price."""

    def __init__(self, platform: str, product_id: str, reason: str) -> None:
        self.platform = platform
        self.product_id = product_id
        self.reason = reason
        super().__init__(f"[{platform}] {product_id}: {reason}")
