"""Tests for platform claim-email resolution."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from claimit_mongodb_models import Policy
from src.draft.platform_defaults import (
    PLATFORM_CLAIM_EMAILS,
    resolve_claim_email,
    resolve_merchant_name,
)


def _policy(claim_email: str | None, *, platform: str = "hilton") -> Policy:
    return Policy(
        _id=uuid4(),
        platform=platform,
        category="hotel",
        window_days=15,
        window_days_member=None,
        pre_arrival_hours_required=None,
        covers_own_drops=True,
        covers_competitor_drops=False,
        claim_type="email",
        claim_url=None,
        claim_email=claim_email,
        claim_phone=None,
        loyalty_required=False,
        award_ticket_eligible=None,
        bundle_exclusions=True,
        key_exclusions=[],
        policy_url="https://example.com",
        policy_text_full="full",
        policy_text_relevant_clause="clause",
        last_verified=datetime.now(UTC),
        active=True,
    )


def test_resolve_prefers_policy_email() -> None:
    assert resolve_claim_email("hilton", _policy("custom@hilton.com")) == "custom@hilton.com"


def test_resolve_platform_default() -> None:
    assert resolve_claim_email("best_buy", _policy(None)) == PLATFORM_CLAIM_EMAILS["best_buy"]


def test_resolve_generic_fallback() -> None:
    assert (
        resolve_claim_email("unknown_merchant", _policy(None))
        == "priceadjustments@unknown_merchant.example.com"
    )


def test_resolve_merchant_name_known_platform() -> None:
    assert resolve_merchant_name("best_buy") == "Best Buy"
    assert resolve_merchant_name("hilton") == "Hilton"


def test_resolve_merchant_name_unknown_platform_title_cases() -> None:
    assert resolve_merchant_name("unknown_merchant") == "Unknown Merchant"
