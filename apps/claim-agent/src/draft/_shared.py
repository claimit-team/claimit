from __future__ import annotations

import asyncio
import inspect
import json
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

MODEL_NAME = "gemini-2.5-flash"
APP_NAME = "claimit-claim-draft"
DRAFT_TIMEOUT_SECONDS = 30

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


def _build_user_message(
    platform: str,
    policy_clause: str,
    user_instruction: str | None = None,
) -> str:
    payload: dict[str, str] = {"platform": platform, "policy_clause": policy_clause}
    if user_instruction is not None:
        payload["user_instruction"] = user_instruction
    return json.dumps(payload, ensure_ascii=False)


async def _run_draft_agent(
    platform: str,
    policy_clause: str,
    build_agent: Callable[[], Agent],
    user_instruction: str | None = None,
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
                text=_build_user_message(platform, policy_clause, user_instruction)
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
