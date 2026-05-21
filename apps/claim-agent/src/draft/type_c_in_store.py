from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from claimit_mongodb_models import Claim, Policy, Purchase
from claimit_mongodb_models.user import DefaultLocation
from google.adk import Agent
from maps.google_maps import StoreInfo, find_nearest_store
from pydantic import BaseModel

if TYPE_CHECKING:
    from search.interface import SearchClient

from ._shared import (
    MODEL_NAME,
    DraftGenerationError,
    _run_draft_agent,
    _strip_json_fence,
)
from .models import ClaimDraft

_log = logging.getLogger(__name__)

IN_STORE_GUIDE_SYSTEM_PROMPT = """
You generate in-store price match guides for retail stores in JSON format.

CRITICAL ANTI-HALLUCINATION RULES:
Do not include any specific numbers, prices, dates, store names, phone numbers, or addresses in
your response. Use only the placeholder tokens provided. Do not invent any facts, amounts, dates,
locations, or identifiers.

Use ONLY these exact placeholder tokens for all factual information:
- {{USER_NAME}} — the customer's full name
- {{PRODUCT_NAME}} — the name of the purchased product
- {{ORIGINAL_PRICE}} — the price originally paid
- {{CURRENT_PRICE}} — the current lower advertised price
- {{REFUND_AMOUNT}} — the refund amount being requested
- {{STORE_ADDRESS}} — the address of the nearest store
- {{STORE_HOURS}} — the store's opening hours
- {{STORE_PHONE}} — the store's phone number
- {{CLAIM_URL}} — the URL for the price match policy or claim page
- {{POLICY_CITATION}} — the exact policy clause text justifying the claim
- {{ORDER_ID}} — the order or booking reference number

Output format — return ONLY a valid JSON object with exactly these five fields:
- "opening_statement": the first sentence {{USER_NAME}} should say at the customer service desk
- "what_to_bring": a JSON array of strings listing items to bring (must include proof of purchase
  referencing {{ORDER_ID}} and evidence of the lower price {{CURRENT_PRICE}})
- "talking_points": a JSON array of 3-5 strings, each a complete sentence using placeholder tokens
- "policy_citation": the verbatim policy clause text quoted from the provided policy (do NOT use
  a placeholder here — write the actual quoted clause)
- "fallback_note": what {{USER_NAME}} should do if the representative denies the claim; must suggest
  asking for a manager and referencing {{CLAIM_URL}}

Tone: clear, confident, customer-friendly — suitable for direct use in a store conversation.

No prose outside the JSON. No markdown fences. Only the JSON object.
""".strip()


class _InStoreGuideOutput(BaseModel):
    opening_statement: str
    what_to_bring: list[str]
    talking_points: list[str]
    policy_citation: str
    fallback_note: str


def _format_in_store_guide(output: _InStoreGuideOutput) -> str:
    lines: list[str] = [
        "## In-Store Price Match Guide",
        "",
        "**What to Say**",
        output.opening_statement,
        "",
        "**What to Bring**",
    ]
    for item in output.what_to_bring:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("**Talking Points**")
    for i, point in enumerate(output.talking_points, start=1):
        lines.append(f"{i}. {point}")
    lines.extend(
        [
            "",
            "**Policy Reference**",
            output.policy_citation,
            "",
            "**If Your Claim Is Denied**",
            output.fallback_note,
        ]
    )
    return "\n".join(lines)


def _fill_in_store_placeholders(
    text: str,
    *,
    user_name: str,
    product_name: str,
    original_price: str,
    current_price: str,
    refund_amount: str,
    store_address: str,
    store_hours: str,
    store_phone: str,
    claim_url: str,
    policy_citation: str,
    order_id: str,
) -> str:
    replacements = {
        "{{USER_NAME}}": user_name,
        "{{PRODUCT_NAME}}": product_name,
        "{{ORIGINAL_PRICE}}": original_price,
        "{{CURRENT_PRICE}}": current_price,
        "{{REFUND_AMOUNT}}": refund_amount,
        "{{STORE_ADDRESS}}": store_address,
        "{{STORE_HOURS}}": store_hours,
        "{{STORE_PHONE}}": store_phone,
        "{{CLAIM_URL}}": claim_url,
        "{{POLICY_CITATION}}": policy_citation,
        "{{ORDER_ID}}": order_id,
    }
    for token, value in replacements.items():
        text = text.replace(token, value)
    if "{{" in text:
        raise DraftGenerationError("In-store guide contains unreplaced placeholder tokens")
    return text


def _parse_in_store_guide_output(raw_output: str | None) -> _InStoreGuideOutput:
    if not raw_output or not raw_output.strip():
        raise DraftGenerationError("Draft generator returned empty output")
    try:
        payload = json.loads(_strip_json_fence(raw_output))
    except json.JSONDecodeError as exc:
        raise DraftGenerationError("Draft generator returned malformed JSON") from exc
    output = _InStoreGuideOutput.model_validate(payload)
    if not (3 <= len(output.talking_points) <= 5):
        raise DraftGenerationError(f"Expected 3-5 talking points, got {len(output.talking_points)}")
    return output


async def generate_in_store_guide(
    claim: Claim,
    purchase: Purchase,
    policy: Policy,
    search_client: SearchClient,
    user_name: str = "Valued Customer",
    current_price: float | None = None,
    user_location: DefaultLocation | None = None,
) -> ClaimDraft:
    query = f"{purchase.platform} price match in-store refund policy"
    try:
        results = await search_client.search_policies(query=query, limit=1)
    except Exception:
        _log.warning("Policy search failed, using fallback clause", exc_info=True)
        results = []
    if results:
        policy_clause = (
            results[0].get("policy_text_relevant_clause") or policy.policy_text_relevant_clause
        )
    else:
        policy_clause = policy.policy_text_relevant_clause

    store_info: StoreInfo | None = None
    if user_location is not None and not (user_location.lat == 0 and user_location.lon == 0):
        store_info = await find_nearest_store(
            user_location.lat, user_location.lon, str(purchase.platform)
        )

    if store_info is not None:
        store_address = store_info.address
        store_hours = "; ".join(store_info.hours) if store_info.hours else ""
        store_phone = store_info.phone
    else:
        claim_fallback_url = str(policy.claim_url) if policy.claim_url else str(policy.policy_url)
        store_address = f"your nearest store (find at: {claim_fallback_url})"
        store_hours = ""
        store_phone = str(policy.claim_phone) if policy.claim_phone else ""

    def _build_in_store_agent() -> Agent:
        return Agent(
            name="in_store_guide_agent",
            model=MODEL_NAME,
            instruction=IN_STORE_GUIDE_SYSTEM_PROMPT,
            output_schema=_InStoreGuideOutput,
            tools=[],
        )

    raw_output = await _run_draft_agent(
        str(purchase.platform), policy_clause, _build_in_store_agent
    )
    output = _parse_in_store_guide_output(raw_output)

    markdown_content = _format_in_store_guide(output)

    resolved_current_price = (
        current_price
        if current_price is not None
        else round(purchase.price_paid - claim.claim_amount, 2)
    )
    claim_url = str(policy.claim_url) if policy.claim_url else str(policy.policy_url)
    filled_content = _fill_in_store_placeholders(
        markdown_content,
        user_name=user_name,
        product_name=purchase.product_name or "your product",
        original_price=f"${purchase.price_paid:.2f}",
        current_price=f"${resolved_current_price:.2f}",
        refund_amount=f"${claim.claim_amount:.2f}",
        store_address=store_address,
        store_hours=store_hours,
        store_phone=store_phone,
        claim_url=claim_url,
        policy_citation=output.policy_citation,
        order_id=purchase.order_id or str(claim.id),
    )

    return ClaimDraft(
        claim_id=claim.id,
        draft_content=filled_content,
        subject="",
        to_address="",
        policy_clause_cited=policy_clause,
        platform=str(purchase.platform),
        claim_type="in_store",
        refund_amount=claim.claim_amount,
        currency=claim.currency,
        model_used=MODEL_NAME,
        draft_version=len(claim.draft_versions) + 1,
        generated_at=datetime.now(UTC),
    )
