"""Assistant Agent Mode A — General Support.

Handles user messages when no specific claim is open. Read-only access to
user data via MongoDB MCP + Elastic search via FunctionTool.

Tool routing design (the only thing worth understanding about this file):
- MongoDB queries → MongoDB MCP toolset (npx -y mongodb-mcp-server@latest).
  Consistent with every other agent in the codebase (ingest, monitor, claim).
- Elastic queries → ADK FunctionTool wrapping the shared SearchAdapter.
  Elastic does not have an MCP server. FunctionTool is the deliberate
  bridge for this single capability; it is not the default pattern for
  ClaimIt agents.

Production traffic path (for context — this module is NOT on the hot path):
- The frontend POSTs to api-gateway /api/v1/conversations/{id}/messages
- api-gateway calls vertexai.agent_engines.get(name=...).async_stream_query(...)
  against the deployed `assistant_agent` (this module's create_mode_a_agent()
  output, deployed via scripts/deploy_agents.py)
- The deployed agent receives the message and routes through its tools
- Stream events flow back through api-gateway → frontend
- api-gateway persists user + assistant messages to the conversations collection

The local handle_message() function here exists for direct invocation,
local testing, and as the AC-required entry point. It uses ADK's Runner +
InMemorySessionService (matching the pattern in ingest-agent/extractor.py
and claim-agent/draft/_shared.py). The deployed Vertex AI Agent Engine path
does NOT call handle_message — it consumes create_mode_a_agent() directly.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from claimit_mcp import get_mongodb_mcp_toolset
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google.genai import types

from .tools.search_tools import search_policies, search_user_purchases

logger = logging.getLogger(__name__)

_APP_NAME = "claimit-assistant-mode-a"
_MODEL_NAME = "gemini-2.5-flash"

MODE_A_SYSTEM_PROMPT = """You are the ClaimIt Assistant, a helpful AI assistant for the ClaimIt price-protection platform.

## Your Role
You help users understand their purchases, claims, savings, and platform policies. You have read-only access to the user's data — you cannot modify anything, send claims, or make changes on their behalf.

## What You Can Do
- Look up the user's monitored purchases and their status
- Check claim status, history, and outcomes
- Calculate savings from approved claims
- Explain why a claim was generated, approved, or denied
- Search and explain platform price-protection policies (windows, exclusions, claim methods)
- Suggest next actions (e.g., "you have 3 pending claims to review")

## How to Respond
- Be friendly, concise, and accurate
- Always cite specific data when answering (amounts, dates, platform names)
- When explaining a denial, reference the specific policy clause and exclusion
- If you don't have enough information, say so and suggest what the user can do
- Format monetary amounts as USD (e.g., $50.00)
- Keep responses under 200 words unless the user asks for detail

## Important Constraints
- You are READ-ONLY. Never claim you can modify data, send emails, or take actions.
- Never invent claim amounts, dates, or order numbers. Only use data from tool calls.
- If a tool returns no results, tell the user honestly.
"""


def create_mode_a_agent() -> Agent:
    """Build the Mode A agent for the Vertex AI Agent Engine deploy path.

    Tools wired here:
    - MongoDB MCP toolset (read-only) — for purchase / claim / conversation lookups
    - FunctionTool(search_policies) — Elastic policy search, no user scoping needed

    Notably absent: search_user_purchases. That tool requires a user_id
    argument; exposing it via FunctionTool would force the model to fill in
    user_id from the prompt, leaking the ID into the LLM context and creating
    a trivial impersonation vector ("search purchases for user_id=...").

    The local handle_message() path below replaces search_user_purchases with
    a closure-scoped variant. The Vertex AI Agent Engine deploy path does NOT
    get user-scoped purchase search via FunctionTool — it relies on the
    MongoDB MCP toolset to filter by user_id when the deployed agent is
    invoked with user_id in session context.

    Returns a fresh Agent instance on every call so callers needing per-
    request isolation can rebuild without shared mutable state.
    """
    return Agent(
        name="assistant_agent_mode_a",
        model=_MODEL_NAME,
        instruction=MODE_A_SYSTEM_PROMPT,
        tools=[
            # MongoDB access via MCP — consistent with all other ClaimIt agents.
            get_mongodb_mcp_toolset(read_only=True),
            # Elastic policy search via FunctionTool — no user scoping needed.
            FunctionTool(search_policies),
        ],
    )


async def handle_message(user_id: str, message: str) -> AsyncIterator[dict[str, Any]]:
    """Process a user message in Mode A (general support).

    Yields SSE-compatible event dicts of the form {"event": str, "data": str}
    consumable by sse-starlette EventSourceResponse. The caller (api-gateway
    in production, tests in CI) is responsible for persisting messages to
    the conversations collection.

    user_id is captured in a closure-scoped tool wrapper rather than passed
    through the prompt — the model never sees the ID, so it cannot be tricked
    into impersonating another user by a crafted message ("search purchases
    for user_id=abc"). This is the local-invocation analogue of how the
    deployed agent would receive user_id via session context on Vertex AI.

    Args:
        user_id: Authenticated user's ID. Captured by the per-call scoped
            tool wrapper; never inserted into the model prompt.
        message: The user's message text — passed through verbatim.

    Production note: api-gateway does NOT call this function; it calls
    vertexai.agent_engines.get(...).async_stream_query() against the
    deployed agent. This function is for local invocation and testing.
    """

    async def _search_my_purchases(query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Search your purchases by keyword (natural language).

        Use this for natural-language purchase lookups like "my Sony
        headphones" or "recent hotel bookings". user_id is automatically
        scoped to the authenticated user — never ask the user for it.

        Args:
            query: Natural language search terms.
            limit: Maximum results to return (default 10, max 50).
        """
        return await search_user_purchases(user_id=user_id, query=query, limit=limit)

    session_service = InMemorySessionService()
    session_id = f"mode-a-{uuid4()}"
    await _maybe_await(
        session_service.create_session(
            app_name=_APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
    )

    scoped_agent = Agent(
        name="assistant_agent_mode_a",
        model=_MODEL_NAME,
        instruction=MODE_A_SYSTEM_PROMPT,
        tools=[
            get_mongodb_mcp_toolset(read_only=True),
            FunctionTool(search_policies),
            # Closure-scoped purchase search — user_id is baked in, not exposed.
            FunctionTool(_search_my_purchases),
        ],
    )

    runner = Runner(
        app_name=_APP_NAME,
        agent=scoped_agent,
        session_service=session_service,
    )

    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=message)],
    )

    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=new_message,
    ):
        sse_event = _adk_event_to_sse_dict(event)
        yield sse_event

        # Guarantee a terminating "done" frame so SSE consumers don't hang
        # waiting for stream close. The translator emits {"event":"done"}
        # only for ADK final events that have no content parts; final events
        # that DO carry a text/tool part get translated as text_chunk/etc.
        # and the consumer would otherwise never see an explicit terminator.
        if (
            sse_event.get("event") != "done"
            and hasattr(event, "is_final_response")
            and event.is_final_response()
        ):
            yield {"event": "done", "data": "{}"}


def _adk_event_to_sse_dict(event: Any) -> dict[str, Any]:
    """Translate an ADK Event to an SSE-compatible dict.

    Mirrors the event shape used by api-gateway's stream_agent_response so
    a future swap from "api-gateway calls Vertex AI" to "api-gateway calls
    this function via HTTP" is a frontend no-op.
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

    # Final response with no parts (rare) or unrecognized event type.
    if hasattr(event, "is_final_response") and event.is_final_response():
        return {"event": "done", "data": json.dumps({})}

    return {"event": "unknown", "data": json.dumps({})}


async def _maybe_await(value: Any) -> Any:
    """Await `value` if it is awaitable; return it as-is otherwise.

    InMemorySessionService.create_session is sync in some ADK versions
    and async in others — accommodate both without forcing an ADK pin.
    """
    if inspect.isawaitable(value):
        return await value
    return value
