from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from claimit_mongodb_models import Claim, Policy, Purchase
from google.adk import Agent
from pydantic import BaseModel

if TYPE_CHECKING:
    from search.interface import SearchClient

from ._shared import (
    MODEL_NAME,
    _run_draft_agent,
    _strip_json_fence,
)
from .models import ClaimDraft

_log = logging.getLogger(__name__)

# ─── Sub-pattern constants ────────────────────────────────────────────────────

DIRECT_REBOOK = "direct_rebook"  # Southwest, United
CANCEL_REBOOK = "cancel_rebook"  # Delta, American — user must cancel first, risky
FORM_SUBMIT = "form_submit"  # Alaska — user submits claim form
PORTAL_REQUEST = "portal_request"  # Costco, Dell — retail online portal

# ─── Platform metadata ────────────────────────────────────────────────────────

PLATFORM_META: dict[str, dict] = {
    "southwest": {
        "display_name": "Southwest Airlines",
        "base_url": "https://support.southwest.com/helpcenter/s/article/changing-cancelling-flights",
        "sub_pattern": DIRECT_REBOOK,
        "estimated_minutes": 3,
        "credit_type": "Rapid Rewards points",
    },
    "united": {
        "display_name": "United Airlines",
        "base_url": "https://www.united.com/en/us/fly/customer-commitment.html",
        "sub_pattern": DIRECT_REBOOK,
        "estimated_minutes": 5,
        "credit_type": "Future Flight Credit (1-year expiry)",
    },
    "delta": {
        "display_name": "Delta Air Lines",
        "base_url": "https://www.delta.com/us/en/booking-information/online-booking/low-fare-commitment",
        "sub_pattern": CANCEL_REBOOK,
        "estimated_minutes": 8,
        "credit_type": "original tender",
    },
    "american": {
        "display_name": "American Airlines",
        "base_url": "https://www.aa.com/web/i18n/customer-service/faqs/reservations-tickets-faqs.html",
        "sub_pattern": CANCEL_REBOOK,
        "estimated_minutes": 8,
        "credit_type": "original tender",
    },
    "alaska": {
        "display_name": "Alaska Airlines",
        "base_url": "https://www.alaskaair.com/content/about-us/customer-commitment/customer-commitment-lowest-fare",
        "sub_pattern": FORM_SUBMIT,
        "estimated_minutes": 5,
        "credit_type": "voucher",
    },
    "costco": {
        "display_name": "Costco",
        "base_url": "https://customerservice.costco.com/app/answers/detail/a_id/628",
        "sub_pattern": PORTAL_REQUEST,
        "estimated_minutes": 5,
        "credit_type": "member account credit",
    },
    "dell": {
        "display_name": "Dell",
        "base_url": "https://www.dell.com/en-us/lp/price-match-guarantee",
        "sub_pattern": PORTAL_REQUEST,
        "estimated_minutes": 5,
        "credit_type": "original tender",
    },
}

# ─── Step templates ───────────────────────────────────────────────────────────

STEP_TEMPLATES: dict[str, list[str]] = {
    "southwest": [
        'Go to {claim_url} and click "Manage Reservations"',
        "Enter your Confirmation #: {order_id} and name: your full name as it appears on your booking",
        'Click "Change flight"',
        "Find and select the SAME flight: {product_name}",
        "Confirm the change — no action needed after this step",
        "Southwest will automatically credit {refund_amount} {currency} in {credit_type} to your account",
    ],
    "united": [
        "Go to {claim_url} and sign in to your MileagePlus account",
        'Find your trip under "Manage Travel" using Confirmation #: {order_id}',
        'Select "Change flight" and choose the same flight at the lower fare',
        "Complete the change — the fare difference will be issued as {credit_type}",
        "NOTE: Basic Economy fares are excluded from this process",
    ],
    "delta": [
        "⚠️  WARNING: This process requires cancelling your current booking. Your original seat selection may be lost.",
        'Go to {claim_url} and click "My Trips"',
        "Look up your trip using Confirmation #: {order_id}",
        'Click "Cancel flight" and confirm cancellation',
        "Immediately search for the SAME flight ({product_name}) and rebook at the current lower fare",
        "Your refund of {refund_amount} {currency} will be returned to your original payment method",
    ],
    "american": [
        "⚠️  WARNING: This process requires cancelling your current booking. Your original seat selection may be lost.",
        'Go to {claim_url} and click "My Trips"',
        "Find your booking using Confirmation #: {order_id}",
        "Cancel your current booking",
        "Search and rebook the SAME flight ({product_name}) at the lower fare immediately",
        "Refund of {refund_amount} {currency} will be returned to your original payment method",
    ],
    "alaska": [
        "Go to {claim_url} to access the Best Value Guarantee claim form",
        "Enter your Confirmation #: {order_id} and name: your full name as it appears on your booking",
        "Enter the lower fare amount and source (Alaska.com current price)",
        "Attach a screenshot of the lower fare as evidence",
        "Submit the form — Alaska will issue a {credit_type} for {refund_amount} {currency} if approved",
    ],
    "costco": [
        'Sign in to costco.com and go to "Orders & Returns"',
        "Find your order: {product_name} (Order #: {order_id})",
        'Select "Request Price Adjustment"',
        "Confirm the lower price — Costco will verify automatically",
        "Credit of {refund_amount} {currency} will be applied to your {credit_type}",
    ],
    "dell": [
        "Go to {claim_url} and sign in to your Dell account",
        'Navigate to "Order Support" and find Order #: {order_id}',
        'Seatch Request" and enter the current lower price',
        "Submit the request — Dell will review within 2-3 business days",
        "If approved, {refund_amount} {currency} will be refunded to your original payment method",
    ],
}

# ─── SelfServiceWalkthrough model ─────────────────────────────────────────────


class SelfServiceWalkthrough(BaseModel):
    platform_display_name: str
    order_summary: str
    steps: list[str]
    notes: list[str]
    sub_pattern: str
    estimated_minutes: int
    claim_url: str
    credit_type: str


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _build_notes_prompt(
    platform_display_name: str,
    policy: Policy,
    refund_amount: float,
    currency: str,
    credit_type: str,
) -> str:
    key_exclusions_json = json.dumps(getattr(policy, "key_exclusions", []) or [])
    relevant_clause = getattr(policy, "policy_text_relevant_clause", "") or ""
    return (
        f"You are a price adjustment claims assistant. Generate 3-5 concise notes for a customer "
        f"performing a self-service price adjustment with {platform_display_name}.\n\n"
        f"Policy clause: {relevant_clause}\n"
        f"Key exclusions: {key_exclusions_json}\n"
        f"Refund amount: {refund_amount:.2f} {currency}\n"
        f'Credit type: "{credit_type}"\n\n'
        f"Focus your notes on:\n"
        f"- Eligibility conditions for the price adjustment\n"
        f'- What "{credit_type}" means for the customer (how they receive and use it)\n'
        f"- Key exclusions that may affect the claim\n"
        f"- Any time-sensitive warnings\n\n"
        f'Return ONLY a JSON array of strings, no markdown, no preamble. Example: ["note 1", "note 2"]'
    )


def _render_steps(platform: str, context: dict) -> list[str]:
    if platform not in STEP_TEMPLATES:
        raise ValueError(f"No step template for platform: {platform}")
    return [step.format(**context) for step in STEP_TEMPLATES[platform]]


def _parse_notes(raw: str | None, fallback_policy: Policy) -> list[str]:
    if raw is not None:
        try:
            cleaned = _strip_json_fence(raw)
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and all(isinstance(n, str) for n in parsed):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass
    key_exclusions = getattr(fallback_policy, "key_exclusions", None) or []
    return list(key_exclusions)


def _build_order_summary(
    purchase: Purchase,
    refund_amount: float,
    currency: str,
    current_price: float | None = None,
) -> str:
    price_paid = round(purchase.price_paid, 2)
    now_price = (
        round(current_price, 2)
        if current_price is not None
        else round(price_paid - refund_amount, 2)
    )
    refund = round(refund_amount, 2)
    return (
        f"{purchase.product_name} | "
        f"Paid {price_paid:.2f} → Now {now_price:.2f} | "
        f"Save {refund:.2f} {currency}"
    )


# ─── Main generator ───────────────────────────────────────────────────────────


async def generate_self_service_walkthrough(
    claim: Claim,
    purchase: Purchase,
    policy: Policy,
    search_client: SearchClient,
    user_name: str = "Valued Customer",
    current_price: float | None = None,
) -> ClaimDraft:
    platform = (
        purchase.platform.value.lower()
        if hasattr(purchase.platform, "value")
        else str(purchase.platform).lower()
    )

    meta = PLATFORM_META.get(platform)
    if meta is None:
        raise ValueError(f"Unsupported platform for Type D: {platform}")

    refund_amount = round(claim.claim_amount, 2)
    currency = claim.currency or "USD"
    claim_url = getattr(policy, "claim_url", None) or meta["base_url"]

    context = {
        "order_id": purchase.order_id,
        "product_name": purchase.product_name,
        "refund_amount": f"{refund_amount:.2f}",
        "currency": currency,
        "credit_type": meta["credit_type"],
        "claim_url": claim_url,
    }

    rendered_steps = _render_steps(platform, context)

    notes_prompt = _build_notes_prompt(
        meta["display_name"],
        policy,
        refund_amount,
        currency,
        meta["credit_type"],
    )

    def _build_notes_agent() -> Agent:
        return Agent(
            name="self_service_notes_generator",
            model=MODEL_NAME,
            instruction=notes_prompt,
            tools=[],
        )

    raw_notes = await _run_draft_agent(
        platform,
        getattr(policy, "policy_text_relevant_clause", "") or "",
        _build_notes_agent,
    )
    notes = _parse_notes(raw_notes, policy)

    walkthrough = SelfServiceWalkthrough(
        platform_display_name=meta["display_name"],
        order_summary=_build_order_summary(purchase, refund_amount, currency, current_price),
        steps=rendered_steps,
        notes=notes,
        sub_pattern=meta["sub_pattern"],
        estimated_minutes=meta["estimated_minutes"],
        claim_url=claim_url,
        credit_type=meta["credit_type"],
    )

    draft_versions = getattr(claim, "draft_versions", None) or []

    return ClaimDraft(
        claim_id=claim.id,
        draft_content=walkthrough.model_dump_json(),
        subject=f"Self-Service Price Adjustment Guide — {meta['display_name']}",
        to_address="",
        policy_clause_cited=getattr(policy, "policy_text_relevant_clause", "") or "",
        platform=str(purchase.platform),
        claim_type="self_service",
        refund_amount=claim.claim_amount,
        currency=currency,
        model_used=MODEL_NAME,
        draft_version=len(draft_versions) + 1 if draft_versions else 1,
        generated_at=datetime.now(UTC),
    )
