from __future__ import annotations

import asyncio
import inspect
import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from claimit_mongodb_models import Claim, Policy, Purchase
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

if TYPE_CHECKING:
    from search.interface import SearchClient

from .models import ClaimDraft
from .type_a_email import DraftGenerationError

MODEL_NAME = "gemini-2.5-flash"
APP_NAME = "claimit-claim-draft"
DRAFT_TIMEOUT_SECONDS = 30

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


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _extract_event_text(event: Any) -> str | None:
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []
    text_parts = [part.text for part in parts if getattr(part, "text", None)]
    if not text_parts:
        return None
    return "\n".join(text_parts)


def _strip_json_fence(raw: str) -> str:
    s = raw.strip()
    if not s.startswith("```"):
        return s
    lines = s.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _fill_placeholders(
    text: str,
    *,
    order_id: str,
    check_in_date: str,
    checkout_date: str,
    original_price: str,
    current_price: str,
    refund_amount: str,
    user_name: str,
    policy_citation: str,
) -> str:
    replacements = {
        "{{ORDER_ID}}": order_id,
        "{{CHECK_IN_DATE}}": check_in_date,
        "{{CHECKOUT_DATE}}": checkout_date,
        "{{ORIGINAL_PRICE}}": original_price,
        "{{CURRENT_PRICE}}": current_price,
        "{{REFUND_AMOUNT}}": refund_amount,
        "{{USER_NAME}}": user_name,
        "{{POLICY_CITATION}}": policy_citation,
    }
    for token, value in replacements.items():
        text = text.replace(token, value)
    return text


def _build_chat_script_agent() -> Agent:
    return Agent(
        name="chat_script_generator",
        model=MODEL_NAME,
        instruction=CHAT_SCRIPT_SYSTEM_PROMPT,
        output_schema=_ChatScriptOutput,
        tools=[],
    )


def _build_user_message(platform: str, policy_clause: str) -> str:
    return json.dumps(
        {"platform": platform, "policy_clause": policy_clause},
        ensure_ascii=False,
    )


async def _run_draft_agent(platform: str, policy_clause: str) -> str | None:
    session_service = InMemorySessionService()
    session_id = f"draft-{uuid4()}"
    user_id = "claim-draft-generator"

    await _maybe_await(
        session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
    )

    runner = Runner(
        app_name=APP_NAME,
        agent=_build_chat_script_agent(),
        session_service=session_service,
    )
    message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=_build_user_message(platform, policy_clause))],
    )

    final_text: str | None = None
    try:
        async with asyncio.timeout(DRAFT_TIMEOUT_SECONDS):
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
            ):
                if event.is_final_response():
                    final_text = _extract_event_text(event)
    except TimeoutError as exc:
        raise DraftGenerationError(f"Draft generation timed out for session {session_id}") from exc

    return final_text


def _parse_chat_script_output(raw_output: str | None) -> _ChatScriptOutput:
    if not raw_output or not raw_output.strip():
        raise DraftGenerationError("Draft generator returned empty output")
    try:
        payload = json.loads(_strip_json_fence(raw_output))
    except json.JSONDecodeError as exc:
        raise DraftGenerationError("Draft generator returned malformed JSON") from exc
    return _ChatScriptOutput.model_validate(payload)


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
) -> ClaimDraft:
    query = f"{purchase.platform} price match guarantee refund eligibility"
    results = await search_client.search_policies(query=query, limit=1)
    if results:
        policy_clause = results[0].get(
            "policy_text_relevant_clause", policy.policy_text_relevant_clause
        )
    else:
        policy_clause = policy.policy_text_relevant_clause

    raw_output = await _run_draft_agent(str(purchase.platform), policy_clause)
    draft_output = _parse_chat_script_output(raw_output)

    current_price = round(purchase.price_paid - claim.claim_amount, 2)
    kwargs = dict(
        order_id=purchase.order_id,
        check_in_date=purchase.purchase_date.strftime("%Y-%m-%d"),
        checkout_date=purchase.window_expires.strftime("%Y-%m-%d"),
        original_price=str(purchase.price_paid),
        current_price=str(current_price),
        refund_amount=str(claim.claim_amount),
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
        draft_version=1,
        generated_at=datetime.now(UTC),
    )
