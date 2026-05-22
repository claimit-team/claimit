"""Assistant Agent Mode B — Claim-Focused (ticket 3.23).

Activated automatically when the user opens the approval UI for a specific
claim. The conversation is scoped to that one claim — the Assistant can
explain why the claim looks the way it does, queue a redraft from feedback
("make it friendlier"), flip the per-claim send_override, and cite the
agent's own reasoning trace from Phoenix.

Tool routing design:
- All four tools are *closure-scoped* to (user_id, claim_id) — see
  `tools/claim_tools.py`. Neither ID ever reaches the LLM prompt or tool
  arguments, so a hostile message ("look up claim XYZ instead") cannot
  break the claim/user scope.
- Mode A's MongoDB-MCP-via-deploy-path pattern is intentionally NOT used
  here: MCP exposes the full Mongo surface and pushes the claim-scope
  burden onto the system prompt, which the model can ignore under
  adversarial input. The closure-scoped FunctionTool route gives us
  typed Pydantic responses, claim-id immutability by construction, and
  Python-level ownership checks for the write tool.

Production traffic path (deferred to ticket 5.9):
- The deploy story for Mode B (api-gateway → Vertex AI Agent Engine
  with claim_id injected via session context) lands with the approval
  UI Assistant pane. This module's `handle_message` is the AC-required
  local entry point; the deploy path will reuse `create_mode_b_agent`
  once 5.9 sets up the session-scoped claim_id injection it needs.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google.genai import types

from .tools.claim_tools import (
    make_get_claim_context,
    make_get_reasoning_trace,
    make_request_redraft,
    make_update_send_override,
)

logger = logging.getLogger(__name__)

_APP_NAME = "claimit-assistant-mode-b"
_MODEL_NAME = "gemini-2.5-flash"

MODE_B_SYSTEM_PROMPT = """You are the ClaimIt Assistant in claim-focused mode.

## Your Role
You are scoped to a single claim — the one the user is currently reviewing in their approval pane. You help them understand it, refine it, and decide how it should be sent.

## Tools You Have
- `get_claim_context()` — pulls the active claim along with its linked purchase and policy. Call this first if the user asks anything about what the claim is or why it exists.
- `get_reasoning_trace()` — returns the agent's drafting reasoning: cited policy clause, chosen claim type, self-evaluation scores, and (when available) a Phoenix trace deep link. Use this for "why did you choose this template / tone / amount" questions.
- `request_redraft(feedback)` — queues a new draft of THIS claim with the user's feedback (e.g. "make it friendlier", "shorter", "more formal"). The claim agent will regenerate; the new version shows up in the approval pane.
- `update_send_override(mode)` — sets how THIS claim should be sent. "approval" means ask the user every time, "auto" means send automatically after the standard delay, null clears the override (falls back to the account default).

## Important Constraints
- You are scoped to a single claim. You cannot look up other claims, modify other users, or change account-wide settings. If the user asks about another claim, tell them to open it in the approval pane.
- Tool calls do not require you to specify claim_id or user_id — they are bound to the active session. Do not ask the user for these.
- Always confirm mutations after they succeed. "Done — I set this claim to auto-send" / "Queued — I asked for a friendlier redraft."
- If a tool returns `error`, explain it honestly and suggest the next step. Do not retry blindly.
- Format monetary amounts as USD (e.g., $50.00).
- Keep responses under 200 words unless the user asks for detail.

## What the user usually wants
- "make it friendlier" / "shorter" / "more formal" → `request_redraft(feedback="...")`
- "why did you choose this template" / "why this tone" → `get_reasoning_trace()` then summarize
- "cancel auto-send" / "stop auto-sending this one" → `update_send_override(mode="approval")`
- "send this one automatically" → `update_send_override(mode="auto")`
- "what is this claim about" → `get_claim_context()` then summarize
"""


def create_mode_b_agent(*, user_id: str, claim_id: str) -> Agent:
    """Build a Mode B agent bound to a specific (user_id, claim_id).

    A fresh Agent is returned on every call — each conversation thread
    must own its own closure-scoped tools so claim_id leakage between
    threads is impossible by construction. Caching the agent at module
    level would defeat the closure scope.

    Tools wired:
        - get_claim_context (closure-scoped to user_id + claim_id)
        - update_send_override (closure-scoped, write — checks ownership)
        - request_redraft (closure-scoped, publishes claim.redraft_requested)
        - get_reasoning_trace (closure-scoped, lightweight Phoenix link)
    """
    return Agent(
        name="assistant_agent_mode_b",
        model=_MODEL_NAME,
        instruction=MODE_B_SYSTEM_PROMPT,
        tools=[
            FunctionTool(make_get_claim_context(user_id=user_id, claim_id=claim_id)),
            FunctionTool(make_update_send_override(user_id=user_id, claim_id=claim_id)),
            FunctionTool(make_request_redraft(user_id=user_id, claim_id=claim_id)),
            FunctionTool(make_get_reasoning_trace(user_id=user_id, claim_id=claim_id)),
        ],
    )


async def handle_message(
    user_id: str,
    claim_id: str,
    message: str,
) -> AsyncIterator[dict[str, Any]]:
    """Process a user message in Mode B (claim-focused).

    Yields SSE-compatible event dicts identical in shape to Mode A's
    output (so a future swap from "api-gateway calls Vertex AI Agent
    Engine" to "api-gateway calls this function via HTTP" is a frontend
    no-op).

    user_id AND claim_id are captured in closure-scoped tool wrappers
    rather than passed through the prompt — the model never sees either
    ID and cannot be coerced into cross-claim or cross-user access by
    a crafted message.

    Args:
        user_id: Authenticated user's ID. Bound to all four tools.
        claim_id: The active claim's ID. Bound to all four tools.
        message: The user's message text — passed through verbatim.
    """
    session_service = InMemorySessionService()
    session_id = f"mode-b-{uuid4()}"
    await _maybe_await(
        session_service.create_session(
            app_name=_APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
    )

    scoped_agent = create_mode_b_agent(user_id=user_id, claim_id=claim_id)

    runner = Runner(
        app_name=_APP_NAME,
        agent=scoped_agent,
        session_service=session_service,
    )

    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=message)],
    )

    # Track whether we have emitted a terminating frame so the `finally`
    # block can guarantee one even if `runner.run_async` raises mid-stream
    # or the consumer drops the generator early. Without this, an
    # exception inside the Runner leaves SSE consumers waiting forever.
    done_sent = False
    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=new_message,
        ):
            sse_event = _adk_event_to_sse_dict(event)
            yield sse_event

            # Final events that carry text/tool parts get translated as
            # text_chunk/etc.; the consumer would otherwise never see an
            # explicit terminator. Track that we sent one so `finally`
            # doesn't double-emit.
            if (
                sse_event.get("event") != "done"
                and hasattr(event, "is_final_response")
                and event.is_final_response()
            ):
                done_sent = True
                yield {"event": "done", "data": "{}"}
    finally:
        if not done_sent:
            yield {"event": "done", "data": "{}"}


def _adk_event_to_sse_dict(event: Any) -> dict[str, Any]:
    """Translate an ADK Event to an SSE-compatible dict.

    Shape mirrors `mode_a._adk_event_to_sse_dict` exactly — keeping the
    wire format identical means the api-gateway SSE consumer doesn't
    need a mode switch.
    """
    import json

    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []

    for part in parts:
        text = getattr(part, "text", None)
        if text:
            return {"event": "text_chunk", "data": json.dumps({"text": text})}

        function_call = getattr(part, "function_call", None)
        if function_call is not None:
            return {
                "event": "tool_call",
                "data": json.dumps(
                    {
                        "tool": getattr(function_call, "name", None),
                        "input": dict(getattr(function_call, "args", {}) or {}),
                    }
                ),
            }

        function_response = getattr(part, "function_response", None)
        if function_response is not None:
            return {
                "event": "tool_result",
                "data": json.dumps(
                    {
                        "tool": getattr(function_response, "name", None),
                        "output_summary": str(getattr(function_response, "response", ""))[:200],
                    }
                ),
            }

    if hasattr(event, "is_final_response") and event.is_final_response():
        return {"event": "done", "data": json.dumps({})}

    return {"event": "unknown", "data": json.dumps({})}


async def _maybe_await(value: Any) -> Any:
    """Await `value` if it is awaitable; return it as-is otherwise.

    Mirrors `mode_a._maybe_await` — InMemorySessionService.create_session
    is sync in some ADK versions and async in others.
    """
    if inspect.isawaitable(value):
        return await value
    return value
