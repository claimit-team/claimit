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
    DraftGenerationError,
    _fill_placeholders,
    _run_draft_agent,
    _strip_json_fence,
)
from .models import ClaimDraft

_log = logging.getLogger(__name__)

CHAT_SCRIPT_SYSTEM_PROMPT = """
You generate customer-service chat scripts for price match refund claims in JSON format.

CRITICAL ANTI-HALLUCINATION RULES:
Do not include any specific numbers, prices, dates, or IDs in your response.
Use only the placeholder tokens provided. Do not invent any facts, amounts, dates, or identifiers.

Use ONLY these exact placeholder tokens for all factual information:
- {{ORDER_ID}} — the booking or order reference number
- {{CHECK_IN_DATE}} — the check-in or purchase date
- {{CHECKOUT_DATE}} — the checkout or stay end date
- {{ORIGINAL_PRICE}} — the price originally paid
- {{CURRENT_PRICE}} — the current lower advertised price
- {{REFUND_AMOUNT}} — the refund amount being requested
- {{USER_NAME}} — the customer's full name
- {{POLICY_CITATION}} — the exact policy clause text justifying the claim

The script must contain exactly 5 main steps followed by 2 escalation steps:

main_steps (5 steps — use when agent is cooperative):
Step 1: Greet the agent and state the purpose — requesting a price match refund
Step 2: Provide booking details: order {{ORDER_ID}}, dates {{CHECK_IN_DATE}} through {{CHECKOUT_DATE}}
Step 3: State the price discrepancy — originally paid {{ORIGINAL_PRICE}}, current price is {{CURRENT_PRICE}}, request refund of {{REFUND_AMOUNT}}
Step 4: Cite the applicable policy clause: {{POLICY_CITATION}}
Step 5: Proactively offer proof and confirm order reference {{ORDER_ID}}

escalation_steps (2 steps — use if agent declines or stalls):
Step 6: Request transfer to a supervisor or ask for a case number to escalate the matter
Step 7: Ask for the formal submission channel and insist on receiving a reference number for the record

Tone: conversational, polite, and firm — suitable for direct copy-paste into a live chat window.

Return ONLY a valid JSON object with exactly three fields:
- "title": a concise script title (must reference {{ORDER_ID}})
- "main_steps": a JSON array of exactly 5 strings, one per step
- "escalation_steps": a JSON array of exactly 2 strings, one per step

No prose outside the JSON. No markdown fences. Only the JSON object.
""".strip()


class _ChatScriptOutput(BaseModel):
    title: str
    main_steps: list[str]
    escalation_steps: list[str]


def _build_chat_script_agent() -> Agent:
    return Agent(
        name="chat_script_generator",
        model=MODEL_NAME,
        instruction=CHAT_SCRIPT_SYSTEM_PROMPT,
        output_schema=_ChatScriptOutput,
        tools=[],
    )


def _parse_chat_script_output(raw_output: str | None) -> _ChatScriptOutput:
    if not raw_output or not raw_output.strip():
        raise DraftGenerationError("Draft generator returned empty output")
    try:
        payload = json.loads(_strip_json_fence(raw_output))
    except json.JSONDecodeError as exc:
        raise DraftGenerationError("Draft generator returned malformed JSON") from exc
    result = _ChatScriptOutput.model_validate(payload)
    if len(result.main_steps) != 5:
        raise DraftGenerationError(f"Expected 5 main steps, got {len(result.main_steps)}")
    if len(result.escalation_steps) != 2:
        raise DraftGenerationError(
            f"Expected 2 escalation steps, got {len(result.escalation_steps)}"
        )
    return result


def _format_chat_script(output: _ChatScriptOutput) -> str:
    lines: list[str] = [output.title, ""]
    for i, step in enumerate(output.main_steps, start=1):
        lines.append(f"Step {i}: {step}")
    lines.append("")
    lines.append("--- IF AGENT DECLINES ---")
    lines.append("")
    offset = len(output.main_steps) + 1
    for i, step in enumerate(output.escalation_steps, start=offset):
        lines.append(f"Step {i}: {step}")
    return "\n".join(lines)


async def generate_chat_script(
    claim: Claim,
    purchase: Purchase,
    policy: Policy,
    search_client: SearchClient,
    user_name: str = "Valued Customer",
    current_price: float | None = None,
) -> ClaimDraft:
    query = f"{purchase.platform} price match guarantee refund eligibility"
    try:
        results = await search_client.search_policies(query=query, limit=1)
    except Exception:
        _log.warning("Policy search failed, using fallback clause", exc_info=True)
        results = []
    if results:
        policy_clause = results[0].get(
            "policy_text_relevant_clause", policy.policy_text_relevant_clause
        )
    else:
        policy_clause = policy.policy_text_relevant_clause

    raw_output = await _run_draft_agent(
        str(purchase.platform), policy_clause, _build_chat_script_agent
    )
    draft_output = _parse_chat_script_output(raw_output)

    resolved_current_price = (
        current_price
        if current_price is not None
        else round(purchase.price_paid - claim.claim_amount, 2)
    )
    kwargs = dict(
        order_id=purchase.order_id,
        check_in_date=purchase.purchase_date.strftime("%Y-%m-%d"),
        checkout_date=purchase.window_expires.strftime("%Y-%m-%d"),
        original_price=f"${purchase.price_paid:.2f}",
        current_price=f"${resolved_current_price:.2f}",
        refund_amount=f"${claim.claim_amount:.2f}",
        user_name=user_name,
        policy_citation=policy_clause,
    )

    filled_title = _fill_placeholders(draft_output.title, **kwargs)
    filled_steps = draft_output.model_copy(
        update={
            "title": filled_title,
            "main_steps": [_fill_placeholders(s, **kwargs) for s in draft_output.main_steps],
            "escalation_steps": [
                _fill_placeholders(s, **kwargs) for s in draft_output.escalation_steps
            ],
        }
    )
    if any(
        "{{" in s
        for s in [filled_steps.title, *filled_steps.main_steps, *filled_steps.escalation_steps]
    ):
        raise DraftGenerationError("Draft contains unreplaced placeholder tokens")

    draft_content = _format_chat_script(filled_steps)

    return ClaimDraft(
        claim_id=claim.id,
        draft_content=draft_content,
        subject=filled_title,
        to_address="",
        policy_clause_cited=policy_clause,
        platform=str(purchase.platform),
        claim_type="chat_script",
        refund_amount=claim.claim_amount,
        currency=claim.currency,
        model_used=MODEL_NAME,
        draft_version=len(claim.draft_versions) + 1,
        generated_at=datetime.now(UTC),
    )
