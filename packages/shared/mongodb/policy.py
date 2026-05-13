"""Policy collection — mirror of Policy.ts."""

from datetime import datetime

from .base import BaseDocument
from .enums import Category, ClaimType, Platform


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
