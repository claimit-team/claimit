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
_POLICY_LIMIT_MAX = 5


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


async def _search_policies(query: str, limit: int) -> list[dict[str, Any]]:
    """Inner helper — pure async fn the smoke test can call directly.

    Direct-Mongo policy lookup (Plan-B style, no Elastic): fetch all ACTIVE
    policies (~26 docs) and rank them in Python. Policies are GLOBAL — no
    user scoping, no ToolContext.
    """
    limit = max(1, min(limit, _POLICY_LIMIT_MAX))
    q = (query or "").strip().lower()
    if not q:
        return [{"error": "empty_query"}]

    try:
        db = MongoDBClient()
        policies = await db.find_policies({"active": True})
    except Exception as exc:
        return [{"error": "db_unavailable", "detail": type(exc).__name__}]

    platform_matches: list[Any] = []
    text_matches: list[Any] = []
    for p in policies:
        platform_value = getattr(p.platform, "value", p.platform)
        platform = str(platform_value).lower()
        platform_label = platform.replace("_", " ")
        if platform in q or platform_label in q:
            platform_matches.append(p)
            continue
        haystack = f"{p.policy_text_full} {p.policy_text_relevant_clause}".lower()
        if q in haystack or any(len(tok) >= 4 and tok in haystack for tok in q.split()):
            text_matches.append(p)

    chosen = platform_matches if platform_matches else text_matches
    results = chosen[:limit]
    if not results:
        return []
    return [p.model_dump(mode="json", by_alias=True) for p in results]


async def search_policies(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Look up a platform's price-protection / price-match policy.

    Use for "how does Hilton's price match work", "what's Delta's refund window",
    "does Best Buy do price adjustments", or any best-rate-guarantee (BRG) /
    price-protection question.

    Args:
        query: A platform name and/or policy topic (free text).
        limit: Maximum policies to return, default 5, capped at 5.

    Returns:
        Matching policy documents, or `[]` when nothing matches. On failure:
        `[{"error": "db_unavailable", "detail": <exception class name>}]`;
        on blank query: `[{"error": "empty_query"}]`.
    """
    return await _search_policies(query, limit)


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
- `search_policies(query, limit=5)` — looks up a platform's price-protection / price-match / best-rate-guarantee policy by platform name or topic (e.g. "Hilton", "Delta refund window"). Returns the window, exclusions, claim method, and the relevant policy text. Call this for any "how does <platform>'s policy work" / BRG / price-match question.

## How to Respond
- Be friendly, concise, and accurate
- Always cite specific data when answering (amounts, dates, platform names)
- When explaining a denial, reference the specific policy clause and exclusion
- If you don't have enough information, say so and suggest what the user can do
- Format monetary amounts as USD (e.g., $50.00)
- Keep responses under 200 words unless the user asks for detail

## Important Constraints
- You are READ-ONLY. Never claim you can modify data, send emails, or take actions.
- Never invent purchases, prices, claim amounts, dates, order numbers, policies, or policy clauses. Only state facts returned by your tool calls.
- For a policy question, call `search_policies` first and answer only from what it returns. If it returns `[]`, say you don't have that platform's policy on file rather than guessing.
- If a tool returns `{"error": ...}`, explain honestly that the lookup failed and suggest the user try again. Do not retry blindly.
- If a tool returns no results, tell the user honestly.
"""

assistant_agent = Agent(
    name="assistant_agent",
    model="gemini-2.5-flash",
    instruction=MODE_A_SYSTEM_PROMPT,
    tools=[FunctionTool(get_all_purchases_for_user), FunctionTool(search_policies)],
)
