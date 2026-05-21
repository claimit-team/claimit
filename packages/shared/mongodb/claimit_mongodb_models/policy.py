"""Policy collection — mirror of Policy.ts."""

from datetime import datetime

from .base import BaseDocument
from .enums import Category, ClaimType, Platform

# Fallback price-match window applied ONLY when no Policy doc exists for
# the purchase's platform. Anything that has a policy uses
# `policy.window_days` (or `window_days_member` for tiered members),
# including legitimate `window_days == 0` (e.g. Amazon — purchase is
# immediately past-window). 15 days mirrors the legacy hardcoded value
# in the email-path extractor so behavior is stable when extraction
# runs against an unknown platform.
DEFAULT_CLAIM_WINDOW_DAYS = 15


class Policy(BaseDocument):
    platform: Platform
    category: Category
    window_days: int
    window_days_member: int | None
    pre_arrival_hours_required: int | None
    covers_own_drops: bool
    covers_competitor_drops: bool
    claim_type: ClaimType
    claim_url: str | None
    claim_email: str | None
    claim_phone: str | None
    loyalty_required: bool
    award_ticket_eligible: bool | None
    bundle_exclusions: bool
    key_exclusions: list[str]
    policy_url: str
    policy_text_full: str
    policy_text_relevant_clause: str
    last_verified: datetime
    active: bool


def compute_window_days(
    policy: Policy | None,
    *,
    member_tier_at_purchase: str | None,
) -> int:
    """Pick the right window-days value for a purchase against its Policy.

    Precedence:
      1. `policy is None` → `DEFAULT_CLAIM_WINDOW_DAYS` (15). Only branch
         that synthesizes a number — every other branch returns whatever
         the Policy doc actually says, including 0.
      2. Member tier set AND `policy.window_days_member` not None →
         `policy.window_days_member`. Today only Best Buy carries a
         member-specific window in seeded data.
      3. Otherwise `policy.window_days`. Note this includes legitimate 0
         (Amazon today) — the caller MUST treat `purchase_date + 0` as a
         valid past-window result, NOT substitute a fallback.

    Single source of truth for the "policy-window everywhere" rule
    introduced by ticket 5.14 (confirm + finalize + email-path
    extractor all import this helper rather than re-deriving the
    branch).
    """
    if policy is None:
        return DEFAULT_CLAIM_WINDOW_DAYS
    if member_tier_at_purchase and policy.window_days_member is not None:
        return policy.window_days_member
    return policy.window_days
