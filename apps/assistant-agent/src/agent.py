"""ADK Agent definition — deploy entry point.

scripts/deploy_agents.py loads this file via importlib.exec_module as a
standalone module — there is no parent package context, so only absolute
imports from installed packages work here. No relative imports
(`from .mode_a`), no `from src.*` paths.

This mirrors the pattern used by ingest_agent, monitor_agent, and
claim_agent — those three still construct their Agent inline in agent.py
using `claimit_mcp` + `google.adk` imports. The assistant_agent diverges
(ticket 5.10 Plan B): the MongoDB MCP HTTP transport is replaced with a
direct `claimit_mongodb_models.MongoDBClient` query because Agent Engine
runtime hit an opaque IAM 403 against the Cloud Run MCP service that
neither logger nor stderr-print diagnostics could surface (PRs #192/#196).
Switching to a direct Atlas connection drops the entire Cloud Run / OIDC /
IAM hop. The MCP wheel is still shipped (peer agents need it); only this
agent stops importing from it.

The Mode A system prompt and handle_message() live in mode_a.py for local
invocation and the test suite. This file duplicates the Agent construction
for deploy compatibility — if you change tool wiring or the prompt in
mode_a.py, mirror the change here.

NOTE — annotations are NOT future-stringified here:
    Run #26 verify failed with `name 'Any' is not defined` because
    `from __future__ import annotations` makes annotations into strings,
    and cloudpickle's function pickler only ships globals referenced in
    the bytecode. `Any` only appears in annotations (not bytecode), so
    cloudpickle drops it. When ADK on Agent Engine resolves type hints
    on the restored function (`typing.get_type_hints`), `func.__globals__`
    no longer contains `Any` → NameError. Evaluating annotations at
    def-time (no future import) gives us real `list[dict[str, Any]]`
    objects on `__annotations__`, which survive cloudpickle by reference.

user_id is injected via `tool_context`:
    The first parameter is `tool_context: ToolContext` — ADK auto-injects
    this from the active session and STRIPS it from the LLM-facing tool
    declaration. The LLM only sees `limit`. user_id reaches the function
    via `tool_context.user_id`, which the api-gateway already populates
    via `vertexai.agent_engines.get(...).async_stream_query(user_id=...)`.
    This is the deploy-path equivalent of Mode B's closure-scoping
    (mode_b.py:124-134) — user_id cannot be supplied or overridden by
    chat content.
"""

from typing import Any
from uuid import UUID

from claimit_mongodb_models import MongoDBClient
from google.adk import Agent
from google.adk.tools import FunctionTool, ToolContext

_PURCHASE_LIMIT_MAX = 50


async def _fetch_purchases_for_user(user_id: str, limit: int) -> list[dict[str, Any]]:
    """Inner helper — pure async function the smoke test can call directly.

    Split from the ADK-facing tool so unit tests don't need to construct
    a real ToolContext (which depends on an active InvocationContext that
    only exists inside a Runner). The tool wrapper below is a thin shim
    that extracts user_id from the session and delegates here.
    """
    limit = max(1, min(limit, _PURCHASE_LIMIT_MAX))
    try:
        uid = UUID(user_id)
    except (ValueError, TypeError, AttributeError):
        return [{"error": "invalid_user_id"}]

    try:
        db = MongoDBClient()
        purchases = await db.find_purchases({"user_id": uid}, limit=limit)
    except Exception as exc:
        # Surface the failure class to the LLM so it can apologize rather
        # than hallucinate data. Keep the message generic — Atlas error
        # text can include the cluster hostname which we don't want
        # echoed to the user.
        return [{"error": "db_unavailable", "detail": type(exc).__name__}]

    return [p.model_dump(mode="json", by_alias=True) for p in purchases]


async def get_all_purchases_for_user(
    tool_context: ToolContext, limit: int = 50
) -> list[dict[str, Any]]:
    """List monitored purchases belonging to the authenticated user.

    Use this for "show me my purchases", "what am I monitoring", "what
    did I buy from <platform>" style questions.

    The user is determined from the active session — there is no
    user_id parameter the model can fill in. The LLM-facing tool
    declaration omits `tool_context` (ADK strips it).

    Args:
        limit: Maximum results, default 50, capped at 50.

    Returns:
        A list of purchase documents (snake_case keys, ISO-8601 dates).
        On a malformed session user_id, returns
        `[{"error": "invalid_user_id"}]`. On connection failure, returns
        `[{"error": "db_unavailable", "detail": <exception class name>}]`.
    """
    return await _fetch_purchases_for_user(tool_context.user_id, limit)


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

## Tools You Have
- `get_all_purchases_for_user(limit=50)` — returns the active user's monitored purchases. The user is scoped automatically by the session; you do not pass a user id. Call this for any "my purchases" / "what am I monitoring" / "what did I buy" question.

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
- If a tool returns `{"error": ...}`, explain honestly that the lookup failed and suggest the user try again. Do not retry blindly.
- If a tool returns no results, tell the user honestly.
"""

assistant_agent = Agent(
    name="assistant_agent",
    model="gemini-2.5-flash",
    instruction=MODE_A_SYSTEM_PROMPT,
    tools=[FunctionTool(get_all_purchases_for_user)],
)
