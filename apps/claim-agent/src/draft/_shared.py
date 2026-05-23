from __future__ import annotations

import asyncio
import inspect
import json
import logging
import re
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from claimit_mongodb_models.enums import Category
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

MODEL_NAME = "gemini-2.5-flash"
APP_NAME = "claimit-claim-draft"
DRAFT_TIMEOUT_SECONDS = 90

_log = logging.getLogger(__name__)

_PARAGRAPH_MANDATE = (
    "Use blank lines (\\n\\n) between paragraphs (salutation, body paragraphs, closing). "
    "Never output a single run-on paragraph."
)

# ADK resolves `{{TOKEN}}` in agent instructions to `{TOKEN}` and injects from
# session.state. Seed identity mappings so the model sees literal `{{TOKEN}}`
# placeholders (filled post-LLM by _fill_placeholders), not real claim data.
DRAFT_INSTRUCTION_PLACEHOLDER_STATE: dict[str, str] = {
    "ORDER_ID": "{{ORDER_ID}}",
    "CHECK_IN_DATE": "{{CHECK_IN_DATE}}",
    "CHECKOUT_DATE": "{{CHECKOUT_DATE}}",
    "ORIGINAL_PRICE": "{{ORIGINAL_PRICE}}",
    "CURRENT_PRICE": "{{CURRENT_PRICE}}",
    "REFUND_AMOUNT": "{{REFUND_AMOUNT}}",
    "USER_NAME": "{{USER_NAME}}",
    "POLICY_CITATION": "{{POLICY_CITATION}}",
    "PRODUCT_NAME": "{{PRODUCT_NAME}}",
    "PURCHASE_DATE": "{{PURCHASE_DATE}}",
    "WINDOW_END_DATE": "{{WINDOW_END_DATE}}",
    "TRAVEL_DATE": "{{TRAVEL_DATE}}",
    "RETURN_DATE": "{{RETURN_DATE}}",
    "MERCHANT_NAME": "{{MERCHANT_NAME}}",
    "STORE_ADDRESS": "{{STORE_ADDRESS}}",
    "STORE_HOURS": "{{STORE_HOURS}}",
    "STORE_PHONE": "{{STORE_PHONE}}",
    "CLAIM_URL": "{{CLAIM_URL}}",
}


class DraftGenerationError(RuntimeError):
    pass


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


def _normalize_draft_prose(text: str) -> str:
    """Conservative post-LLM formatting — no intra-word splitting."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in normalized.split("\n")]
    result = "\n".join(lines)
    if "\n" not in result.strip() and len(result) > 120:
        parts = re.split(r"(?<=\.)\s+", result)
        if len(parts) > 1:
            result = "\n\n".join(part.strip() for part in parts if part.strip())
    return result


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


def _fill_email_placeholders(
    text: str,
    *,
    category: Category | str,
    order_id: str,
    original_price: str,
    current_price: str,
    refund_amount: str,
    user_name: str,
    policy_citation: str,
    merchant_name: str,
    product_name: str = "",
    purchase_date: str = "",
    window_end_date: str = "",
    check_in_date: str = "",
    checkout_date: str = "",
    travel_date: str = "",
    return_date: str = "",
) -> str:
    cat = Category(category) if not isinstance(category, Category) else category
    replacements: dict[str, str] = {
        "{{ORDER_ID}}": order_id,
        "{{ORIGINAL_PRICE}}": original_price,
        "{{CURRENT_PRICE}}": current_price,
        "{{REFUND_AMOUNT}}": refund_amount,
        "{{USER_NAME}}": user_name,
        "{{POLICY_CITATION}}": policy_citation,
        "{{MERCHANT_NAME}}": merchant_name,
    }
    if cat == Category.RETAIL:
        replacements.update(
            {
                "{{PRODUCT_NAME}}": product_name,
                "{{PURCHASE_DATE}}": purchase_date,
                "{{WINDOW_END_DATE}}": window_end_date,
            }
        )
    elif cat == Category.HOTEL:
        replacements.update(
            {
                "{{CHECK_IN_DATE}}": check_in_date,
                "{{CHECKOUT_DATE}}": checkout_date,
            }
        )
    elif cat == Category.AIRLINE:
        replacements.update(
            {
                "{{TRAVEL_DATE}}": travel_date,
                "{{RETURN_DATE}}": return_date,
            }
        )
    for token, value in replacements.items():
        text = text.replace(token, value)
    return text


def _build_user_message(
    platform: str,
    policy_clause: str,
    user_instruction: str | None = None,
    *,
    category: str | None = None,
) -> str:
    payload: dict[str, str] = {"platform": platform, "policy_clause": policy_clause}
    if category is not None:
        payload["category"] = category
    if user_instruction is not None:
        payload["user_instruction"] = user_instruction
    return json.dumps(payload, ensure_ascii=False)


async def _run_draft_agent(
    platform: str,
    policy_clause: str,
    build_agent: Callable[[], Agent],
    user_instruction: str | None = None,
    *,
    category: str | None = None,
) -> str | None:
    session_service = InMemorySessionService()
    session_id = f"draft-{uuid4()}"
    user_id = "claim-draft-generator"

    await _maybe_await(
        session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
            state=dict(DRAFT_INSTRUCTION_PLACEHOLDER_STATE),
        )
    )

    runner = Runner(
        app_name=APP_NAME,
        agent=build_agent(),
        session_service=session_service,
    )
    message = types.Content(
        role="user",
        parts=[
            types.Part.from_text(
                text=_build_user_message(
                    platform,
                    policy_clause,
                    user_instruction,
                    category=category,
                )
            )
        ],
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


def paragraph_mandate() -> str:
    return _PARAGRAPH_MANDATE


async def warm_up_draft_model() -> None:
    """Fire one trivial ADK→genai→Vertex call on startup so the first REAL draft
    generation isn't the cold one (token + model spin-up + TLS). Best-effort:
    never raises."""
    try:
        session_service = InMemorySessionService()
        session_id = f"warmup-{uuid4()}"
        user_id = "warmup"
        await _maybe_await(
            session_service.create_session(
                app_name=APP_NAME,
                user_id=user_id,
                session_id=session_id,
            )
        )
        runner = Runner(
            app_name=APP_NAME,
            agent=Agent(name="warmup", model=MODEL_NAME, instruction="Reply with OK."),
            session_service=session_service,
        )
        message = types.Content(role="user", parts=[types.Part.from_text(text="ping")])
        async with asyncio.timeout(DRAFT_TIMEOUT_SECONDS):
            async for _event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
            ):
                pass
    except Exception:  # warm-up is best-effort, must not crash startup
        _log.debug("draft model warm-up failed (non-fatal)", exc_info=True)
