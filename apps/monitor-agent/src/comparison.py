"""Member-tier-aware price comparison (master doc §5.4).

A member-only price for a non-member is not a valid drop. This module selects
the price that matches the buyer's tier-at-purchase and computes the drop math.
Full eligibility (window, policy exclusions, bundle, identical-room, etc.) is
ticket 3.11's `validate_eligibility`, which consumes this result.
"""

from __future__ import annotations

from dataclasses import dataclass

from claimit_mongodb_models import Purchase

from .adapters.base import PriceSnapshot

# Sentinel string for "not a member" stored in Purchase.member_tier_at_purchase.
# Matches LoyaltyTier.NONE in claimit_mongodb_models.enums.
_TIER_NONE = "none"


@dataclass(frozen=True)
class PriceComparison:
    """Result of comparing a purchase's paid price against a current snapshot."""

    drop_amount: float
    drop_percentage: float
    current_price: float | None
    is_member_comparison: bool
    is_eligible: bool


def _buyer_was_member(purchase: Purchase) -> bool:
    tier = purchase.member_tier_at_purchase
    return tier is not None and tier != _TIER_NONE


def compare_prices(purchase: Purchase, snapshot: PriceSnapshot) -> PriceComparison:
    """Compare `purchase.price_paid` against the tier-matched price in `snapshot`.

    Member buyers compare against `snapshot.price_member`; non-members against
    `snapshot.price_non_member`. If the matched price is unavailable we return
    `is_eligible=False` rather than falling back to the other tier — that's the
    false-positive class this exists to prevent.
    """
    is_member = _buyer_was_member(purchase)
    current_price = snapshot.price_member if is_member else snapshot.price_non_member

    if current_price is None:
        return PriceComparison(
            drop_amount=0.0,
            drop_percentage=0.0,
            current_price=None,
            is_member_comparison=is_member,
            is_eligible=False,
        )

    drop_amount = purchase.price_paid - current_price
    drop_percentage = drop_amount / purchase.price_paid * 100
    return PriceComparison(
        drop_amount=drop_amount,
        drop_percentage=drop_percentage,
        current_price=current_price,
        is_member_comparison=is_member,
        is_eligible=drop_amount > 0,
    )
