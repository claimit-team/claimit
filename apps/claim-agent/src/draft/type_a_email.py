from __future__ import annotations

import asyncio
import inspect
import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from claimit_mongodb_models import Claim, Policy, Purchase
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, ValidationError

if TYPE_CHECKING:
    from search.interface import SearchClient

from .models import ClaimDraft

_log = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"
APP_NAME = "claimit-claim-draft"
DRAFT_TIMEOUT_SECONDS = 30

DRAFT_SYSTEM_PROMPT = """
You generate professional price match refund claim emails in JSON format.

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

Your email must:
1. Open with a formal salutation addressing {{USER_NAME}}
2. State the purpose: requesting a price match refund for booking {{ORDER_ID}}
3. Reference the dates: {{CHECK_IN_DATE}} through {{CHECKOUT_DATE}}
4. State the price discrepancy: originally paid {{ORIGINAL_PRICE}}, current price is {{CURRENT_PRICE}}
5. Request a refund of {{REFUND_AMOUNT}}
6. Quote the applicable policy clause: {{POLICY_CITATION}}
7. Close professionally

Tone: professional, polite, factual.

Return ONLY a valid JSON object with exactly two string fields:
- "subject": the email subject line (must include {{ORDER_ID}})
- "email_body": the complete email body from salutation to closing

No prose outside the JSON. No markdown fences. Only the JSON object.
""".strip()


class _DraftOutput(BaseModel):
    subject: str
    email_body: str


class DraftGenerationError(RuntimeError):
    pass


async def _maybe_await(value: Any) -> Any:
    # InMemorySessionService.create_session is currently sync, but other
    # session service implementations (e.g. database-backed) may be async.
    # This helper future-proofs the call site.
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


def _build_draft_agent() -> Agent:
    return Agent(
        name="email_draft_generator",
        model=MODEL_NAME,
        instruction=DRAFT_SYSTEM_PROMPT,
        output_schema=_DraftOutput,
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
        agent=_build_draft_agent(),
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


async def generate_email_draft(
    claim: Claim,
    purchase: Purchase,
    policy: Policy,
    search_client: SearchClient,
    user_name: str = "Valued Customer",
    current_price: float | None = None,
) -> ClaimDraft:
    # Validate early — fail before wasting an LLM call
    if not policy.claim_email or not policy.claim_email.strip():
        raise DraftGenerationError(f"No claim email configured for platform '{purchase.platform}'")

    # 1. Retrieve the most relevant policy clause via search
    query = f"{purchase.platform} price match guarantee refund eligibility"
    try:
        results = await search_client.search_policies(query=query, limit=1)
    except Exception:
        _log.warning(
            "Policy search failed for platform %s, falling back to policy document clause",
            purchase.platform,
        )
        results = []

    if results:
        policy_clause = (
            results[0].get("policy_text_relevant_clause") or policy.policy_text_relevant_clause
        )
    else:
        policy_clause = policy.policy_text_relevant_clause

    # 2. Generate email template via Gemini — placeholders only, no real data
    raw_output = await _run_draft_agent(str(purchase.platform), policy_clause)
    draft_output = _parse_draft_output(raw_output)

    # 3. Programmatic placeholder substitution with real values
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

    filled_body = _fill_placeholders(draft_output.email_body, **kwargs)
    filled_subject = _fill_placeholders(draft_output.subject, **kwargs)

    if "{{" in filled_body or "{{" in filled_subject:
        raise DraftGenerationError("Draft contains unreplaced placeholder tokens")

    return ClaimDraft(
        claim_id=claim.id,
        draft_content=filled_body,
        subject=filled_subject,
        to_address=policy.claim_email,
        policy_clause_cited=policy_clause,
        platform=str(purchase.platform),
        claim_type=str(claim.claim_type),
        refund_amount=claim.claim_amount,
        currency=claim.currency,
        model_used=MODEL_NAME,
        draft_version=len(claim.draft_versions) + 1,
        generated_at=datetime.now(UTC),
    )
