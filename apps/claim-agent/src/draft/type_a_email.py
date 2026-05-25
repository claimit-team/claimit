from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from claimit_mongodb_models import Claim, Policy, Purchase
from claimit_mongodb_models.enums import Category
from google.adk import Agent
from pydantic import BaseModel, ValidationError

if TYPE_CHECKING:
    from search.interface import SearchClient

from ._shared import (
    MODEL_NAME,
    DraftGenerationError,
    _fill_email_placeholders,
    _normalize_draft_prose,
    _run_draft_agent,
    _strip_json_fence,
    paragraph_mandate,
)
from .models import ClaimDraft
from .platform_defaults import resolve_claim_email, resolve_merchant_name

_log = logging.getLogger(__name__)

_ANTI_HALLUCINATION = """
CRITICAL ANTI-HALLUCINATION RULES:
Do not include any specific numbers, prices, dates, or IDs in your response.
Use only the placeholder tokens provided. Do not invent any facts, amounts, dates, or identifiers.
""".strip()

_JSON_OUTPUT = """
Return ONLY a valid JSON object with exactly two string fields:
- "subject": the email subject line (must include {{ORDER_ID}})
- "email_body": the complete email body from salutation through signature

No prose outside the JSON. No markdown fences. Only the JSON object.
""".strip()


def _retail_email_prompt() -> str:
    return f"""
You generate professional retail price match refund claim emails in JSON format.

{_ANTI_HALLUCINATION}

Use ONLY these exact placeholder tokens for all factual information:
- {{MERCHANT_NAME}} — the retailer's display name (salutation target)
- {{ORDER_ID}} — the order reference number
- {{PRODUCT_NAME}} — the purchased product name
- {{PURCHASE_DATE}} — the purchase date
- {{WINDOW_END_DATE}} — the last day of the price-match window
- {{ORIGINAL_PRICE}} — the price originally paid
- {{CURRENT_PRICE}} — the current lower advertised price
- {{REFUND_AMOUNT}} — the refund amount being requested
- {{POLICY_CITATION}} — the exact policy clause text justifying the claim
- {{USER_NAME}} — the customer's full name (signature only, NOT the salutation)

The email is written BY the claimant TO the merchant. Structure the body like this example
(use the placeholders, not literal values):

Hello {{MERCHANT_NAME}} Customer Care,

I'm writing to request a price match refund on a recent purchase.

Order {{ORDER_ID}} — {{PRODUCT_NAME}} at {{ORIGINAL_PRICE}}. The current price is
{{CURRENT_PRICE}}, a difference of {{REFUND_AMOUNT}} within the published price-match window.

Include {{POLICY_CITATION}} and a clear refund request.

Thank you,
{{USER_NAME}}

FORBIDDEN in retail emails: booking, stay, check-in, checkout, room.
NEVER open with "Dear {{USER_NAME}}" — the salutation must address the merchant.

Tone: professional, polite, factual.
{paragraph_mandate()}

{_JSON_OUTPUT}
""".strip()


def _hotel_email_prompt() -> str:
    return f"""
You generate professional hotel price match refund claim emails in JSON format.

{_ANTI_HALLUCINATION}

Use ONLY these exact placeholder tokens:
- {{MERCHANT_NAME}} — the hotel brand name (salutation target)
- {{ORDER_ID}} — the booking confirmation number
- {{CHECK_IN_DATE}} — check-in date
- {{CHECKOUT_DATE}} — checkout date
- {{ORIGINAL_PRICE}} — the price originally paid
- {{CURRENT_PRICE}} — the current lower advertised rate
- {{REFUND_AMOUNT}} — the refund amount being requested
- {{POLICY_CITATION}} — the exact policy clause text
- {{USER_NAME}} — the guest's full name (signature only)

The email is written BY the guest TO the hotel. Open with a salutation to the merchant
(e.g. "Hello {{MERCHANT_NAME}} Reservations,"). Describe the booking/stay for
{{CHECK_IN_DATE}} through {{CHECKOUT_DATE}}. Close with "Thank you," and {{USER_NAME}}.

NEVER open with "Dear {{USER_NAME}}".

Tone: professional, polite, factual.
{paragraph_mandate()}

{_JSON_OUTPUT}
""".strip()


def _airline_email_prompt() -> str:
    return f"""
You generate professional airline price match refund claim emails in JSON format.

{_ANTI_HALLUCINATION}

Use ONLY these exact placeholder tokens:
- {{MERCHANT_NAME}} — the airline name (salutation target)
- {{ORDER_ID}} — the confirmation or record locator
- {{TRAVEL_DATE}} — the primary travel date
- {{RETURN_DATE}} — the return or end travel date (if applicable)
- {{ORIGINAL_PRICE}} — the fare originally paid
- {{CURRENT_PRICE}} — the current lower advertised fare
- {{REFUND_AMOUNT}} — the refund or credit amount requested
- {{POLICY_CITATION}} — the exact policy clause text
- {{USER_NAME}} — the passenger's full name (signature only)

The email is written BY the passenger TO the airline. Open with a salutation to the merchant
(e.g. "Hello {{MERCHANT_NAME}} Customer Relations,"). Use flight/fare language — NOT booking/stay/room.

NEVER open with "Dear {{USER_NAME}}".

Tone: professional, polite, factual.
{paragraph_mandate()}

{_JSON_OUTPUT}
""".strip()


def _prompt_for_category(category: Category) -> str:
    if category == Category.RETAIL:
        return _retail_email_prompt()
    if category == Category.HOTEL:
        return _hotel_email_prompt()
    if category == Category.AIRLINE:
        return _airline_email_prompt()
    raise DraftGenerationError(f"Unsupported policy category for email drafts: {category}")


class _DraftOutput(BaseModel):
    subject: str
    email_body: str


def _build_draft_agent(category: Category) -> Agent:
    return Agent(
        name="email_draft_generator",
        model=MODEL_NAME,
        instruction=_prompt_for_category(category),
        output_schema=_DraftOutput,
        tools=[],
    )


def _parse_draft_output(raw_output: str | None) -> _DraftOutput:
    if not raw_output or not raw_output.strip():
        raise DraftGenerationError("Draft generator returned empty output")
    try:
        payload = json.loads(_strip_json_fence(raw_output))
    except json.JSONDecodeError as exc:
        raise DraftGenerationError("Draft generator returned malformed JSON") from exc
    try:
        return _DraftOutput.model_validate(payload)
    except ValidationError as exc:
        raise DraftGenerationError("Draft generator returned invalid output schema") from exc


def retail_email_prompt() -> str:
    """Exported for placeholder registry tests."""
    return _retail_email_prompt()


def hotel_email_prompt() -> str:
    """Exported for placeholder registry tests."""
    return _hotel_email_prompt()


def airline_email_prompt() -> str:
    """Exported for placeholder registry tests."""
    return _airline_email_prompt()


async def generate_email_draft(
    claim: Claim,
    purchase: Purchase,
    policy: Policy,
    search_client: SearchClient,
    user_name: str = "Valued Customer",
    current_price: float | None = None,
    user_instruction: str | None = None,
) -> ClaimDraft:
    _ = search_client  # API compatibility; clause comes from loaded policy only.
    _log.info("type_a_email.start: claim_id=%s platform=%s", claim.id, purchase.platform)
    to_address = resolve_claim_email(str(purchase.platform), policy)
    policy_clause = policy.policy_text_relevant_clause
    try:
        category = Category(policy.category)
    except (ValueError, TypeError) as exc:
        _log.warning(
            "type_a_email.unsupported_category claim_id=%s category=%r",
            claim.id,
            policy.category,
        )
        raise DraftGenerationError(f"Unsupported policy category: {policy.category!r}") from exc
    merchant_name = resolve_merchant_name(str(purchase.platform))

    _log.info("type_a_email.gemini_call.start: claim_id=%s category=%s", claim.id, category)
    _t0 = time.perf_counter()
    raw_output = await _run_draft_agent(
        str(purchase.platform),
        policy_clause,
        lambda: _build_draft_agent(category),
        user_instruction,
        category=str(category.value),
    )
    _log.info(
        "type_a_email.gemini_call.end: claim_id=%s raw_len=%d duration_ms=%d",
        claim.id,
        len(raw_output or ""),
        int((time.perf_counter() - _t0) * 1000),
    )
    draft_output = _parse_draft_output(raw_output)
    _log.info("type_a_email.parse.success: claim_id=%s", claim.id)

    resolved_current_price = (
        current_price
        if current_price is not None
        else round(purchase.price_paid - claim.claim_amount, 2)
    )
    purchase_date = purchase.purchase_date.strftime("%Y-%m-%d")
    window_end = purchase.window_expires.strftime("%Y-%m-%d")
    fill_kwargs = dict(
        category=category,
        order_id=purchase.order_id or "",
        original_price=f"${purchase.price_paid:.2f}",
        current_price=f"${resolved_current_price:.2f}",
        refund_amount=f"${claim.claim_amount:.2f}",
        user_name=user_name,
        policy_citation=policy_clause,
        merchant_name=merchant_name,
        product_name=purchase.product_name or "your product",
        purchase_date=purchase_date,
        window_end_date=window_end,
        check_in_date=purchase_date,
        checkout_date=window_end,
        travel_date=purchase_date,
        return_date=window_end,
    )

    filled_body = _normalize_draft_prose(
        _fill_email_placeholders(draft_output.email_body, **fill_kwargs)
    )
    filled_subject = _normalize_draft_prose(
        _fill_email_placeholders(draft_output.subject, **fill_kwargs)
    )

    if "{{" in filled_body or "{{" in filled_subject:
        raise DraftGenerationError("Draft contains unreplaced placeholder tokens")

    _log.info("type_a_email.complete: claim_id=%s draft_len=%d", claim.id, len(filled_body))
    return ClaimDraft(
        claim_id=claim.id,
        draft_content=filled_body,
        subject=filled_subject,
        to_address=to_address,
        policy_clause_cited=policy_clause,
        platform=str(purchase.platform),
        claim_type=str(claim.claim_type),
        refund_amount=claim.claim_amount,
        currency=claim.currency,
        model_used=MODEL_NAME,
        draft_version=len(claim.draft_versions) + 1,
        generated_at=datetime.now(UTC),
    )
