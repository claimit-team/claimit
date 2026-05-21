"""Tests for the policy-window helper introduced by ticket 5.14.

Locked rule (PR-A): window_days for a purchase comes from the matching
Policy doc. Hardcoded 15-day fallback applies ONLY when no Policy
exists. Legitimate `window_days == 0` (e.g. Amazon) is honored without
substitution — that purchase is past-window from the moment it lands.
`window_days_member` takes precedence when the purchase carries a tier
AND the policy has a member-specific value.
"""

from __future__ import annotations

from datetime import UTC, datetime

from claimit_mongodb_models import (
    DEFAULT_CLAIM_WINDOW_DAYS,
    Policy,
    compute_window_days,
)


def _policy(*, window_days: int, window_days_member: int | None = None) -> Policy:
    return Policy.model_validate(
        {
            "_id": "00000000-0000-4000-8000-000000000001",
            "updated_at": datetime.now(UTC).isoformat(),
            "platform": "best_buy",
            "category": "retail",
            "window_days": window_days,
            "window_days_member": window_days_member,
            "pre_arrival_hours_required": None,
            "covers_own_drops": True,
            "covers_competitor_drops": False,
            "claim_type": "self_service",
            "claim_url": "https://example.com",
            "claim_email": None,
            "claim_phone": None,
            "loyalty_required": False,
            "award_ticket_eligible": None,
            "bundle_exclusions": False,
            "key_exclusions": [],
            "policy_url": "https://example.com",
            "policy_text_full": "f",
            "policy_text_relevant_clause": "c",
            "last_verified": datetime.now(UTC).isoformat(),
            "active": True,
        }
    )


def test_returns_default_when_policy_missing() -> None:
    assert compute_window_days(None, member_tier_at_purchase=None) == DEFAULT_CLAIM_WINDOW_DAYS


def test_returns_default_when_policy_missing_even_with_tier() -> None:
    # Tier without a policy still can't pick a member-specific window.
    assert (
        compute_window_days(None, member_tier_at_purchase="my_best_buy_total")
        == DEFAULT_CLAIM_WINDOW_DAYS
    )


def test_uses_policy_window_days_when_no_tier() -> None:
    assert compute_window_days(_policy(window_days=30), member_tier_at_purchase=None) == 30


def test_uses_policy_window_days_when_tier_set_but_no_member_window() -> None:
    # member_tier_at_purchase set but policy doesn't carry a member-specific
    # number → fall back to the plain `window_days`.
    assert (
        compute_window_days(
            _policy(window_days=30, window_days_member=None),
            member_tier_at_purchase="my_best_buy",
        )
        == 30
    )


def test_uses_member_window_when_both_present() -> None:
    assert (
        compute_window_days(
            _policy(window_days=30, window_days_member=60),
            member_tier_at_purchase="my_best_buy_total",
        )
        == 60
    )


def test_member_window_ignored_without_tier() -> None:
    # Policy has a member-window but the purchase has no tier — use the
    # plain `window_days`. Stops a non-member from picking up a
    # member-only window.
    assert (
        compute_window_days(
            _policy(window_days=30, window_days_member=60),
            member_tier_at_purchase=None,
        )
        == 30
    )


def test_zero_window_is_honored() -> None:
    # Amazon today: `window_days == 0`. The purchase is immediately
    # past-window; we must NOT substitute the 15-day fallback or any
    # other synthetic number — caller computes `purchase_date + 0` and
    # the monitor agent skips it as expired.
    assert compute_window_days(_policy(window_days=0), member_tier_at_purchase=None) == 0
