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
runtime hits an opaque IAM 403 against the Cloud Run MCP service that
neither logger nor stderr-print diagnostics could surface (PRs #192/#196).
Switching to a direct Atlas connection drops the entire Cloud Run / OIDC /
IAM hop. The MCP wheel is still shipped (peer agents need it); only this
agent stops importing from it.

The Mode A system prompt and handle_message() live in mode_a.py for local
invocation and the test suite. This file duplicates the Agent construction
for deploy compatibility — if you change tool wiring or the prompt in
mode_a.py, mirror the change here.

user_id surface (hackathon tradeoff):
- `get_all_purchases_for_user` takes user_id as a tool argument. The
  system prompt instructs the model to use the session's authenticated
  user_id and never one supplied by chat content, but the LLM can still
  be tricked. Accepted for single-tenant demo. A future tightening is
  to move this tool to the Cloud Run handle_message path (mode_a.py)
  where user_id can be closure-bound and never reaches the prompt.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from claimit_mongodb_models import MongoDBClient
from google.adk import Agent
from google.adk.tools import FunctionTool

_PURCHASE_LIMIT_MAX = 50


async def get_all_purchases_for_user(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """List monitored purchases belonging to a specific user.

    Use this for "show me my purchases", "what am I monitoring", "what
    did I buy from <platform>" style questions. Always pass the session's
    authenticated user_id — never a user_id supplied in the chat content.

    Args:
        user_id: The authenticated user's UUID (string form). Must come
            from the session context — do not accept values from user
            messages.
        limit: Maximum results, default 50, capped at 50.

    Returns:
        A list of purchase documents (snake_case keys, ISO-8601 dates).
        On invalid user_id, returns `[{"error": "invalid_user_id"}]`.
        On connection failure, returns `[{"error": "db_unavailable", "detail": ...}]`.
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
- `get_all_purchases_for_user(user_id, limit=50)` — returns the user's monitored purchases. The session provides the authenticated `user_id`; always pass that value, never one extracted from the user's message. If the user asks about "someone else's" data, refuse — explain you can only see their own.

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
