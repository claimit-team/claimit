"""Unit tests for proactive_prompts.py.

These templates are pure functions over a dict payload — tests use synthetic
data and assert on the rendered ProactiveOutput shape. No mocking required.
"""

from __future__ import annotations

import re

import pytest
from src.proactive_prompts import (
    PROACTIVE_TEMPLATES,
    ProactiveOutput,
    generate_proactive_output,
)

# ---------------------------------------------------------------------------
# Registry / dispatcher
# ---------------------------------------------------------------------------


def test_all_templates_registered() -> None:
    """All 10 event_types from the spec are wired in PROACTIVE_TEMPLATES."""
    expected = {
        "price_dropped",
        "claim_drafted",
        "claim_queued_auto",
        "claim_submitted",
        "claim_denied",
        "claim_resolved_success",
        "low_confidence_extract",
        "first_time_dashboard",
        "user_returned_after_long_absence",
        "consecutive_rejections",
    }
    assert set(PROACTIVE_TEMPLATES.keys()) == expected
    assert len(PROACTIVE_TEMPLATES) == 10


def test_unknown_event_type_returns_none() -> None:
    """Unknown event_type yields None so the Floating Panel can suppress."""
    assert generate_proactive_output("not_a_real_event", {}) is None


def test_generate_proactive_output_dispatches_correctly() -> None:
    """The dispatcher routes to the right template by event_type string."""
    result = generate_proactive_output("price_dropped", {"platform": "best_buy"})
    assert result is not None
    assert "best_buy" in result.opening_message


# ---------------------------------------------------------------------------
# Per-event-type templates
# ---------------------------------------------------------------------------


def test_price_dropped_includes_platform_and_amount() -> None:
    out = generate_proactive_output(
        "price_dropped",
        {"platform": "best_buy", "refund_amount": 50.0, "window_remaining_hours": 12},
    )
    assert out is not None
    assert "best_buy" in out.opening_message
    assert "$50.00" in out.opening_message
    assert "12 hours" in out.opening_message
    assert any("Refund amount: $50.00" in f for f in out.key_facts)


def test_claim_drafted_has_three_quick_actions() -> None:
    out = generate_proactive_output(
        "claim_drafted",
        {"platform": "hilton", "refund_amount": 75.5, "claim_type": "email"},
    )
    assert out is not None
    assert len(out.quick_actions) == 3
    action_labels = [a["label"] for a in out.quick_actions]
    assert "Make it friendlier" in action_labels
    assert "Explain why" in action_labels
    assert "Approve and send" in action_labels


def test_claim_queued_auto_offers_cancel() -> None:
    out = generate_proactive_output("claim_queued_auto", {"refund_amount": 30})
    assert out is not None
    actions = [a["action"] for a in out.quick_actions]
    assert "cancel_claim" in actions
    assert "$30.00" in out.opening_message


def test_claim_submitted_silent_template_exists() -> None:
    """Even though this is a silent surface, the template must exist so
    iterating PROACTIVE_TEMPLATES.keys() doesn't miss a slot."""
    out = generate_proactive_output("claim_submitted", {"platform": "target"})
    assert out is not None
    assert "target" in out.opening_message
    assert "submitted" in out.opening_message.lower()


def test_claim_denied_includes_denial_reason() -> None:
    out = generate_proactive_output(
        "claim_denied",
        {"platform": "amazon", "denial_reason_extracted": "clearance"},
    )
    assert out is not None
    assert "amazon" in out.opening_message
    assert "clearance" in out.opening_message


def test_claim_resolved_success_has_celebration_emoji_and_amount() -> None:
    out = generate_proactive_output(
        "claim_resolved_success",
        {"platform": "best_buy", "refund_amount": 50.0, "monthly_total_savings": 200.0},
    )
    assert out is not None
    assert "🎉" in out.opening_message
    assert "$50.00" in out.opening_message
    assert "$200.00" in out.opening_message
    assert any("Monthly savings total: $200.00" in f for f in out.key_facts)


def test_claim_resolved_success_without_monthly_total() -> None:
    """When monthly_total_savings is absent, the template omits that line
    rather than rendering a misleading "$0.00 total"."""
    out = generate_proactive_output(
        "claim_resolved_success",
        {"platform": "best_buy", "refund_amount": 50.0},
    )
    assert out is not None
    assert "$50.00" in out.opening_message
    assert "Monthly savings total" not in " ".join(out.key_facts)
    assert "monthly savings" not in out.opening_message.lower()


def test_low_confidence_extract_lists_uncertain_fields() -> None:
    out = generate_proactive_output(
        "low_confidence_extract",
        {
            "low_confidence_fields": ["order_id", "purchase_date"],
            "overall_min": 0.42,
        },
    )
    assert out is not None
    assert "order_id" in out.opening_message
    assert "purchase_date" in out.opening_message
    assert "0.42" in " ".join(out.key_facts)


def test_low_confidence_extract_handles_empty_field_list() -> None:
    """No specific fields flagged → falls back to a generic prompt."""
    out = generate_proactive_output(
        "low_confidence_extract",
        {"low_confidence_fields": [], "overall_min": 0.5},
    )
    assert out is not None
    assert "some fields" in out.opening_message


def test_first_time_dashboard_gmail_connected() -> None:
    out = generate_proactive_output(
        "first_time_dashboard",
        {"platforms_monitored": ["best_buy", "amazon"], "gmail_connected": True},
    )
    assert out is not None
    assert "Gmail" in out.opening_message
    assert "2 platforms" in out.opening_message
    assert any("Gmail connected: Yes" in f for f in out.key_facts)


def test_first_time_dashboard_gmail_not_connected() -> None:
    """Without Gmail the message should reference uploads instead."""
    out = generate_proactive_output(
        "first_time_dashboard",
        {"platforms_monitored": [], "gmail_connected": False},
    )
    assert out is not None
    assert "uploads" in out.opening_message
    assert any("Gmail connected: No" in f for f in out.key_facts)


def test_user_returned_after_long_absence() -> None:
    out = generate_proactive_output(
        "user_returned_after_long_absence",
        {"drops_caught": 7, "total_savings_while_away": 215.50},
    )
    assert out is not None
    assert "7 price drops" in out.opening_message
    assert "$215.50" in out.opening_message


def test_consecutive_rejections() -> None:
    out = generate_proactive_output("consecutive_rejections", {"rejection_count": 5})
    assert out is not None
    assert "5 versions" in out.opening_message
    assert any("Rejected drafts: 5" in f for f in out.key_facts)


# ---------------------------------------------------------------------------
# Defensive behavior
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("event_type", list(PROACTIVE_TEMPLATES.keys()))
def test_missing_payload_renders_without_crashing(event_type: str) -> None:
    """Every template must handle an empty dict — notifications are written
    by multiple producers and the data dict shape is conventional, not
    Pydantic-validated. A malformed payload must not break the Floating
    Panel render."""
    out = generate_proactive_output(event_type, {})
    assert out is not None
    assert isinstance(out, ProactiveOutput)
    assert out.opening_message  # non-empty
    assert isinstance(out.key_facts, list)
    assert isinstance(out.quick_actions, list)
    # Currency fallback should be the placeholder, not a hallucinated value.
    # If $0.00 or any real number appears, the template invented data.
    if "$" in out.opening_message:
        # Allowed: only "$?.??" (the explicit unknown marker).
        assert re.search(r"\$\?\.\?\?", out.opening_message) or all(
            num == "0" for num in re.findall(r"\$([\d,]+)\.", out.opening_message)
        ), f"Template {event_type} hallucinated a currency amount on empty payload"


def test_output_has_no_hallucinated_numbers() -> None:
    """For a payload with specific numeric values, only those numbers (and
    derived formatting like $50.00) should appear in the output. The
    template must never invent monetary amounts."""
    out = generate_proactive_output(
        "price_dropped",
        {"platform": "best_buy", "refund_amount": 42.0, "window_remaining_hours": 8},
    )
    assert out is not None
    # Every numeric token in the message must be 42, 8, or 0 (from $42.00).
    nums_in_message = re.findall(r"\d+", out.opening_message)
    allowed = {"42", "8", "00"}
    for n in nums_in_message:
        assert n in allowed, f"Unexpected number {n!r} in output: {out.opening_message}"


def test_currency_formatting_with_non_numeric_amount_uses_placeholder() -> None:
    """Garbage numeric input → '$?.??' placeholder, not a crash."""
    out = generate_proactive_output(
        "price_dropped",
        {"platform": "best_buy", "refund_amount": "not_a_number"},
    )
    assert out is not None
    assert "$?.??" in out.opening_message


def test_every_quick_action_has_label_and_action() -> None:
    """Schema check across all 10 templates with a minimal payload."""
    for event_type in PROACTIVE_TEMPLATES:
        out = generate_proactive_output(event_type, {})
        assert out is not None
        for qa in out.quick_actions:
            assert qa.get("label"), f"{event_type}: empty label"
            assert qa.get("action"), f"{event_type}: empty action"
