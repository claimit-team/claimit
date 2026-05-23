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

Production traffic path (ticket 5.9):
- api-gateway routes `claim_focused` chat to the assistant-agent Cloud
  Run service, which calls `handle_message` in-process. Each HTTP
  request creates a fresh InMemorySessionService; prior turns are
  replayed from the gateway-supplied `history` list.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from google.adk import Agent
from google.adk.agents.run_config import RunConfig, StreamingMode
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
_WARMUP_TIMEOUT_SECONDS = 90

MODE_B_SYSTEM_PROMPT = """You are the ClaimIt Assistant in claim-focused mode.

## Your Role
You are scoped to a single claim — the one the user is currently reviewing in their approval pane. You help them understand it, refine it, and decide how it should be sent.

## Tools You Have
- `get_claim_context()` — pulls the active claim along with its linked purchase and policy. Call this first if the user asks anything about what the claim is or why it exists.
- `get_reasoning_trace()` — returns the agent's drafting reasoning: cited policy clause, chosen claim type, per-attempt validator results (which issue types blocked each draft), per-attempt self-evaluation scores (which dimensions failed each retry), and a Phoenix trace deep link. Use this for "why did you choose this" / "why was draft N rejected" / "what failed in the self-eval" questions. The payload includes a `phoenix_query_status` field — when it is anything other than `"ok"`, the live trace is not available and you should explain what you can from the claim-doc fields alone rather than fabricate per-attempt detail.
- `request_redraft(feedback)` — queues a new draft of THIS claim with the user's feedback (e.g. "make it friendlier", "shorter", "more formal"). The claim agent will regenerate; the new version shows up in the approval pane.
- `update_send_override(mode)` — sets how THIS claim should be sent. "approval" means ask the user every time, "auto" means send automatically after the standard delay, null clears the override (falls back to the account default).

## Important Constraints
- You are scoped to a single claim. You cannot look up other claims, modify other users, or change account-wide settings. If the user asks about another claim, tell them to open it in the approval pane.
- Tool calls do not require you to specify claim_id or user_id — they are bound to the active session. Do not ask the user for these.
- Always confirm mutations after they succeed. "Done — I set this claim to auto-send" / "Queued — I asked for a friendlier redraft."
- If a tool returns `error`, explain it honestly and suggest the next step. Do not retry blindly.
- After any tool call, always reply with a non-empty message for the user. If `get_reasoning_trace` returns `trace_summary` or `phoenix_query_status` other than `"ok"`, summarize from that plus claim context — never end with a blank reply.
- Format monetary amounts as USD (e.g., $50.00).
- Keep responses under 200 words unless the user asks for detail.

## What the user usually wants
- "make it friendlier" / "shorter" / "more formal" → `request_redraft(feedback="...")`
- "explain the policy match" / "why does this qualify" / "what is this claim about" → `get_claim_context()` first, then summarize the policy clause and refund basis
- "why did you choose this template" / "why this tone" / validator or self-eval questions → `get_reasoning_trace()` then summarize; if `phoenix_query_status` is not `"ok"`, use `trace_summary` and claim-doc fields
- "cancel auto-send" / "stop auto-sending this one" → `update_send_override(mode="approval")`
- "send this one automatically" → `update_send_override(mode="auto")`
"""


@dataclass(frozen=True)
class HistoryMessage:
    """Prior conversation turn supplied by api-gateway on each request."""

    role: str
    content: str


def _format_history_prefix(history: Sequence[HistoryMessage] | None) -> str:
    """Build a transcript prefix so multi-turn context survives stateless HTTP.

    Each Cloud Run request creates a fresh ADK session; replaying prior
    turns as a structured prefix is the reliable cross-request memory path.
    """
    if not history:
        return ""
    lines = ["[Prior conversation — respond to the latest user message only:]"]
    for msg in history:
        label = "User" if msg.role == "user" else "Assistant"
        lines.append(f"{label}: {msg.content}")
    return "\n".join(lines) + "\n\n"


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
    *,
    history: Sequence[HistoryMessage] | None = None,
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
        history: Prior turns from MongoDB, replayed as a transcript prefix.
    """
    history_prefix = _format_history_prefix(history)
    prompt_text = f"{history_prefix}{message}" if history_prefix else message

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
        parts=[types.Part.from_text(text=prompt_text)],
    )

    # Track whether we have emitted a terminating frame so the `finally`
    # block can guarantee one even if `runner.run_async` raises mid-stream
    # or the consumer drops the generator early. Without this, an
    # exception inside the Runner leaves SSE consumers waiting forever.
    done_sent = False
    streamed_text = False
    final_text = ""
    import json

    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=new_message,
            run_config=RunConfig(streaming_mode=StreamingMode.SSE),
        ):
            is_partial = getattr(event, "partial", False)
            content = getattr(event, "content", None)
            parts = getattr(content, "parts", None) or []

            for part in parts:
                text = getattr(part, "text", None)
                if text:
                    if is_partial:
                        yield {"event": "text_chunk", "data": json.dumps({"text": text})}
                        streamed_text = True
                    else:
                        final_text = text
                    continue

                function_call = getattr(part, "function_call", None)
                if function_call is not None:
                    yield {
                        "event": "tool_call",
                        "data": json.dumps(
                            {
                                "tool": getattr(function_call, "name", None),
                                "input": dict(getattr(function_call, "args", {}) or {}),
                            }
                        ),
                    }
                    continue

                function_response = getattr(part, "function_response", None)
                if function_response is not None:
                    yield {
                        "event": "tool_result",
                        "data": json.dumps(
                            {
                                "tool": getattr(function_response, "name", None),
                                "output_summary": str(getattr(function_response, "response", ""))[
                                    :200
                                ],
                            }
                        ),
                    }

            if hasattr(event, "is_final_response") and event.is_final_response():
                done_sent = True
                yield {"event": "done", "data": "{}"}

        if not streamed_text and final_text:
            yield {"event": "text_chunk", "data": json.dumps({"text": final_text})}
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


async def warm_up_mode_b_model() -> None:
    """Fire one trivial ADK→genai→Vertex call on startup so the first REAL
    Mode B turn isn't the cold one. Best-effort: never raises."""
    try:
        session_service = InMemorySessionService()
        session_id = f"warmup-{uuid4()}"
        user_id = "warmup"
        await _maybe_await(
            session_service.create_session(
                app_name=_APP_NAME,
                user_id=user_id,
                session_id=session_id,
            )
        )
        runner = Runner(
            app_name=_APP_NAME,
            agent=Agent(name="warmup", model=_MODEL_NAME, instruction="Reply with OK."),
            session_service=session_service,
        )
        message = types.Content(role="user", parts=[types.Part.from_text(text="ping")])
        async with asyncio.timeout(_WARMUP_TIMEOUT_SECONDS):
            async for _event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
            ):
                pass
    except Exception:  # warm-up is best-effort, must not crash startup
        logger.debug("mode B model warm-up failed (non-fatal)", exc_info=True)
