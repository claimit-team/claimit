"""Proactive Assistant prompt templates — Mode C.

One template per NotificationEventType. Each maps a NotificationEvent.data
payload to a ProactiveOutput that the Global Floating Panel (ticket 5.10)
renders when the Assistant auto-opens.

Why deterministic templates, not Gemini calls:
- These run on every surfaced notification — a Gemini round-trip would be
  cost-prohibitive and slow. The first message a user sees on a price-drop
  notification needs to be sub-100ms; that rules out LLM generation.
- The numbers and platform names are already in the payload; there is
  nothing for an LLM to "compose." Plain string interpolation is correct.
- If the user engages further (clicks "Explain why" or types a follow-up),
  Mode A or Mode B takes over — that is where LLM reasoning belongs.

Templates are defensive about missing payload fields. Notifications are
written by multiple producers (monitor-agent, claim-agent, ingest-agent,
api-gateway) and the data dict shape is conventional, not validated by a
Pydantic model. Missing fields render as "unknown" / "$?.??" / 0 rather
than crashing the Floating Panel render.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

__all__ = [
    "PROACTIVE_TEMPLATES",
    "ProactiveOutput",
    "generate_proactive_output",
]


@dataclass(frozen=True)
class ProactiveOutput:
    """Structured output for a proactive Assistant message.

    Fields:
        opening_message: The single-line greeting the Floating Panel shows
            on auto-open. Should be friendly and end with a specific question
            or call-to-action so the user knows how to respond.
        key_facts: Short bullets the user can scan in <2 seconds. The
            renderer shows these below opening_message.
        quick_actions: One-tap actions the user can take without typing.
            Each entry is {"label": "<button text>", "action": "<machine id>"}.
            The frontend maps action ids to route navigation or follow-up
            API calls.
    """

    opening_message: str
    key_facts: list[str]
    quick_actions: list[dict[str, str]]


# ---------------------------------------------------------------------------
# Payload accessors — uniform "missing field" fallbacks so every template
# can stay focused on its message composition.
# ---------------------------------------------------------------------------


def _safe_get(data: dict[str, Any], key: str, default: Any = "unknown") -> Any:
    """Get a payload field, returning `default` if the key is missing or None."""
    val = data.get(key)
    return val if val is not None else default


def _format_currency(amount: Any) -> str:
    """Format a number as a USD-formatted string ("$1,234.56"). Returns
    "$?.??" if the value can't be coerced to a float — never raises."""
    try:
        return f"${float(amount):,.2f}"
    except (TypeError, ValueError):
        return "$?.??"


def _safe_list(data: dict[str, Any], key: str) -> list[str]:
    """Get a list value from payload, coercing non-list to an empty list.

    Notification payloads come from multiple producers and are not schema-
    validated; a field that should be a list may arrive as a string, None,
    or even a dict. Treat any non-list value as missing rather than letting
    `len(...)` or `", ".join(...)` blow up the Floating Panel render.
    """
    val = data.get(key)
    if isinstance(val, list):
        return [str(x) for x in val]
    return []


# ---------------------------------------------------------------------------
# The 10 templates. Order mirrors NotificationEventType in enums.py.
# ---------------------------------------------------------------------------


def price_dropped(data: dict[str, Any]) -> ProactiveOutput:
    platform = _safe_get(data, "platform")
    amount = _format_currency(data.get("refund_amount"))
    hours = _safe_get(data, "window_remaining_hours", "?")
    return ProactiveOutput(
        opening_message=(
            f"Your {platform} item just dropped {amount}. "
            f"You have {hours} hours left in the claim window — want me to file it?"
        ),
        key_facts=[
            f"Platform: {platform}",
            f"Refund amount: {amount}",
            f"Window remaining: {hours} hours",
        ],
        quick_actions=[
            {"label": "Review draft", "action": "navigate_claim"},
            {"label": "Auto-file now", "action": "approve_claim"},
        ],
    )


def claim_drafted(data: dict[str, Any]) -> ProactiveOutput:
    platform = _safe_get(data, "platform")
    amount = _format_currency(data.get("refund_amount"))
    claim_type = _safe_get(data, "claim_type", "claim")
    return ProactiveOutput(
        opening_message=(
            f"I drafted your {platform} {claim_type} — {amount} refund. "
            f"Want me to make it friendlier or explain my reasoning?"
        ),
        key_facts=[
            f"Platform: {platform}",
            f"Claim type: {claim_type}",
            f"Refund amount: {amount}",
        ],
        quick_actions=[
            {"label": "Make it friendlier", "action": "redraft"},
            {"label": "Explain why", "action": "explain_claim"},
            {"label": "Approve and send", "action": "approve_claim"},
        ],
    )


def claim_queued_auto(data: dict[str, Any]) -> ProactiveOutput:
    amount = _format_currency(data.get("refund_amount"))
    return ProactiveOutput(
        opening_message=(
            f"Auto-sending your {amount} claim shortly. Want me to stop and let you review first?"
        ),
        key_facts=[
            f"Refund amount: {amount}",
            "Mode: auto-send",
        ],
        quick_actions=[
            {"label": "Stop and review", "action": "navigate_claim"},
            {"label": "Send now", "action": "approve_claim"},
            {"label": "Cancel", "action": "cancel_claim"},
        ],
    )


def claim_submitted(data: dict[str, Any]) -> ProactiveOutput:
    """Silent surface — included for completeness so callers can iterate
    PROACTIVE_TEMPLATES.keys() without missing a slot. The Floating Panel
    may suppress auto-open for this event_type; the template still produces
    a sensible message for in-app references that opt in."""
    platform = _safe_get(data, "platform")
    return ProactiveOutput(
        opening_message=(
            f"Your {platform} claim has been submitted. I'll let you know when there's a response."
        ),
        key_facts=[f"Platform: {platform}", "Status: submitted"],
        quick_actions=[
            {"label": "View claim", "action": "navigate_claim"},
        ],
    )


def claim_denied(data: dict[str, Any]) -> ProactiveOutput:
    platform = _safe_get(data, "platform")
    reason = _safe_get(data, "denial_reason_extracted", "not specified")
    return ProactiveOutput(
        opening_message=(
            f"{platform} denied your claim. Reason: {reason}. Want to try a different approach?"
        ),
        key_facts=[
            f"Platform: {platform}",
            f"Denial reason: {reason}",
        ],
        quick_actions=[
            {"label": "Appeal stronger", "action": "redraft"},
            {"label": "Try different angle", "action": "redraft"},
            {"label": "Mark resolved", "action": "resolve_claim"},
        ],
    )


def claim_resolved_success(data: dict[str, Any]) -> ProactiveOutput:
    platform = _safe_get(data, "platform")
    amount = _format_currency(data.get("refund_amount"))
    total = data.get("monthly_total_savings")

    facts = [f"Platform: {platform}", f"Refund: {amount}"]
    msg = f"🎉 You got {amount} back from {platform}!"
    if total is not None:
        total_str = _format_currency(total)
        facts.append(f"Monthly savings total: {total_str}")
        msg += f" That brings your monthly savings to {total_str}."

    return ProactiveOutput(
        opening_message=msg,
        key_facts=facts,
        quick_actions=[
            {"label": "See all refunds", "action": "navigate_dashboard"},
            {"label": "Share", "action": "share"},
        ],
    )


def low_confidence_extract(data: dict[str, Any]) -> ProactiveOutput:
    fields = _safe_list(data, "low_confidence_fields")
    confidence = _safe_get(data, "overall_min", "?")
    field_str = ", ".join(fields) if fields else "some fields"
    return ProactiveOutput(
        opening_message=(
            f"I extracted a purchase from your email, but I'm not confident "
            f"about {field_str}. Can you take a quick look?"
        ),
        key_facts=[
            f"Uncertain fields: {field_str}",
            f"Confidence: {confidence}",
        ],
        quick_actions=[
            {"label": "Confirm and monitor", "action": "confirm_purchase"},
            {"label": "Edit details", "action": "edit_purchase"},
            {"label": "Not an order", "action": "dismiss_purchase"},
        ],
    )


def first_time_dashboard(data: dict[str, Any]) -> ProactiveOutput:
    platforms = _safe_list(data, "platforms_monitored")
    gmail = bool(data.get("gmail_connected"))
    platform_count = len(platforms)
    platform_str = f"{platform_count} platforms" if platform_count else "your purchases"
    source = "your Gmail" if gmail else "uploads"
    return ProactiveOutput(
        opening_message=(f"Hi! I'm watching {platform_str} via {source}. Want a quick tour?"),
        key_facts=[
            f"Platforms monitored: {platform_count}",
            f"Gmail connected: {'Yes' if gmail else 'No'}",
        ],
        quick_actions=[
            {"label": "Show me how", "action": "start_tour"},
            {"label": "Upload a receipt", "action": "navigate_upload"},
            {"label": "Explore on my own", "action": "dismiss"},
        ],
    )


def user_returned_after_long_absence(data: dict[str, Any]) -> ProactiveOutput:
    drops = data.get("drops_caught", 0)
    amount = _format_currency(data.get("total_savings_while_away", 0))
    return ProactiveOutput(
        opening_message=(
            f"Welcome back! While you were away, I caught {drops} price drops worth {amount}."
        ),
        key_facts=[
            f"Price drops caught: {drops}",
            f"Potential savings: {amount}",
        ],
        quick_actions=[
            {"label": "Show me", "action": "navigate_dashboard"},
            {"label": "Skip", "action": "dismiss"},
        ],
    )


def consecutive_rejections(data: dict[str, Any]) -> ProactiveOutput:
    count = data.get("rejection_count", 3)
    return ProactiveOutput(
        opening_message=(
            f"I notice you've rejected {count} versions of this draft. "
            f"Want to tell me what tone you're looking for?"
        ),
        key_facts=[f"Rejected drafts: {count}"],
        quick_actions=[
            {"label": "Describe what I want", "action": "open_chat"},
            {"label": "Cancel this claim", "action": "cancel_claim"},
        ],
    )


# ---------------------------------------------------------------------------
# Registry + dispatcher
# ---------------------------------------------------------------------------


PROACTIVE_TEMPLATES: dict[str, Callable[[dict[str, Any]], ProactiveOutput]] = {
    "price_dropped": price_dropped,
    "claim_drafted": claim_drafted,
    "claim_queued_auto": claim_queued_auto,
    "claim_submitted": claim_submitted,
    "claim_denied": claim_denied,
    "claim_resolved_success": claim_resolved_success,
    "low_confidence_extract": low_confidence_extract,
    "first_time_dashboard": first_time_dashboard,
    "user_returned_after_long_absence": user_returned_after_long_absence,
    "consecutive_rejections": consecutive_rejections,
}


def generate_proactive_output(event_type: str, data: dict[str, Any]) -> ProactiveOutput | None:
    """Look up the template for `event_type` and render against `data`.

    Returns None when the event_type has no proactive template (the caller
    should suppress the auto-open in that case rather than guess a default).
    Templates never raise on missing payload fields — they degrade to
    placeholder strings so a malformed notification can't break the panel.
    """
    template = PROACTIVE_TEMPLATES.get(event_type)
    if template is None:
        return None
    return template(data)
