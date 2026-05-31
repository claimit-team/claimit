"""ADK Agent definition — deploy entry point.

scripts/deploy_agents.py loads this file via importlib.exec_module as a
standalone module — there is no parent package context, so only absolute
imports from installed packages work here. No relative imports
(`from .mode_a`), no `from src.*` paths.

This agent has two complementary global policy lookups, both GENUINE runtime
MCP calls: `search_platform_policy` -> MongoDB MCP (`call_mongodb_mcp_tool`,
exact-platform `find`) and `search_policies_fulltext` -> Elastic Agent Builder
MCP (`call_elastic_mcp_tool`, full-text search over the `policies-fulltext`
index). Per-user purchase reads stay on a closure-scoped direct
`claimit_mongodb_models.MongoDBClient` query (tenancy: user_id comes from
`tool_context`, never an LLM arg — see below). Policies are global data, so
neither policy tool carries a tenancy concern.

History: ticket 5.10 ("Plan B") moved this agent OFF MongoDB MCP after an
"opaque IAM 403" against the Cloud Run MCP service. That was re-diagnosed
on 2026-05-31 and the 403 was NOT an IAM problem — Agent Engine's httpx
stack never attached the OIDC token (the service/IAM/audience were proven
correct; a valid token returns 200). It is fixed by a request event hook in
`claimit_mcp`. A second blocker then surfaced: Gemini function-calling
rejects mongodb-mcp-server's `const`/`oneOf` tool schemas, so the RAW MCP
toolset can't be registered. Hence the thin-FunctionTool-over-MCP pattern
here: the model sees a simple wrapper schema while a real MCP `find`
executes underneath (`call_mongodb_mcp_tool`).

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

import os
from typing import Any
from uuid import UUID

from claimit_mcp import (
    call_elastic_mcp_tool,
    call_mongodb_mcp_tool,
    call_phoenix_mcp_tool,
    extract_agent_builder_documents,
    extract_tool_documents,
    summarize_recent_spans,
)
from claimit_mongodb_models import MongoDBClient
from google.adk import Agent
from google.adk.tools import FunctionTool, ToolContext

_PURCHASE_LIMIT_MAX = 50
_POLICY_LIMIT_MAX = 5
_MONGODB_DATABASE = "claimit"
# Kibana Agent Builder tool id that search_policies_fulltext invokes over MCP.
# Must match the tool defined in Kibana: a single `query` (keyword) param over
# the policies-fulltext index. The row cap is a hardcoded `LIMIT` in the Kibana
# ES|QL (ES|QL's LIMIT takes a literal, not a parameter), so we pass no `limit`.
_ELASTIC_SEARCH_POLICIES_TOOL = "search_policies"


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


async def _find_policy_for_platform(platform: str) -> list[dict[str, Any]]:
    """Inner helper — pure async fn the smoke test can call directly.

    GENUINE runtime MongoDB MCP usage: runs the MCP `find` tool against the
    GLOBAL `policies` collection over Streamable HTTP + OIDC
    (`claimit_mcp.call_mongodb_mcp_tool`). The model only sees the simple
    `search_platform_policy(platform)` signature — the raw MongoDB MCP toolset
    can't be registered with Gemini (its `const`/`oneOf` tool schemas are
    rejected by google-genai function-calling). The collection + filter shape
    are hard-coded here, never LLM args, so the model cannot pivot the query to
    `purchases`/`users`/`claims` — the wrapper IS the tenancy boundary.
    """
    key = (platform or "").strip().lower().replace(" ", "_")
    if not key:
        return [{"error": "empty_query"}]
    try:
        result = await call_mongodb_mcp_tool(
            "find",
            {
                "database": _MONGODB_DATABASE,
                "collection": "policies",
                "filter": {"platform": key},
                "limit": _POLICY_LIMIT_MAX,
            },
        )
    except Exception as exc:
        # Mirror the BUG-31/61 contract the Mode A prompt depends on: surface a
        # structured "search_unavailable" so the LLM apologizes rather than
        # hallucinating policy text. Keep the detail to the exception class.
        return [{"error": "search_unavailable", "detail": type(exc).__name__}]
    return extract_tool_documents(result)


async def search_platform_policy(platform: str) -> list[dict[str, Any]]:
    """Look up a platform's price-protection / price-match policy.

    Use for "how does Hilton's price match work", "what's Delta's refund window",
    "does Best Buy do price adjustments", or any best-rate-guarantee (BRG) /
    price-protection question. Identify the platform from the user's question.

    Args:
        platform: The platform identifier, lowercase with underscores
            (e.g. "best_buy", "hilton", "amazon", "delta").

    Returns:
        Matching policy documents, or `[]` when the platform has no policy on
        file. On a lookup failure: `[{"error": "search_unavailable", ...}]`;
        on a blank platform: `[{"error": "empty_query"}]`.
    """
    return await _find_policy_for_platform(platform)


async def _search_policy_text(query: str) -> list[dict[str, Any]]:
    """Inner helper — pure async fn the smoke test can call directly.

    GENUINE runtime Elastic Agent Builder MCP usage: invokes the Kibana
    `search_policies` Agent Builder tool over Streamable HTTP + an `ApiKey`
    header (`claimit_mcp.call_elastic_mcp_tool`), full-text searching the GLOBAL
    `policies-fulltext` index. The model only sees the simple
    `search_policies_fulltext(query)` signature — the raw Agent Builder MCP
    toolset can't be registered with Gemini (rich MCP schemas are rejected by
    google-genai function-calling). The tool id + index are fixed here, never
    LLM args, so the model cannot pivot the query to per-user data. Policies are
    global → no tenancy concern.
    """
    cleaned = (query or "").strip()
    if not cleaned:
        return [{"error": "empty_query"}]
    try:
        result = await call_elastic_mcp_tool(
            _ELASTIC_SEARCH_POLICIES_TOOL,
            {"query": cleaned},
        )
    except Exception as exc:
        # Mirror the BUG-31/61 contract the prompt depends on: surface a
        # structured "search_unavailable" so the LLM apologizes rather than
        # hallucinating policy text. detail is the exception CLASS ONLY — never
        # str(exc), which would leak the Kibana URL embedded in httpx errors.
        return [{"error": "search_unavailable", "detail": type(exc).__name__}]
    # Agent Builder wraps ES|QL rows in a {"results":[{esql_results...}]} envelope,
    # not a flat array — extract_agent_builder_documents unpacks it to row dicts.
    return extract_agent_builder_documents(result)


async def search_policies_fulltext(query: str) -> list[dict[str, Any]]:
    """Full-text search across ALL platforms' price-protection policies.

    Use this for broad or natural-language policy questions, questions about
    clauses / exclusions / windows phrased in natural language, or "which
    platforms ..." questions where you do NOT have a single exact platform name
    — e.g. "which platforms cover competitor price drops", "hotels with a
    24-hour price-match window", "policies that exclude clearance items". For a
    question about ONE known platform, prefer `search_platform_policy`. If one
    tool returns an error or `[]`, you may try the other.

    Args:
        query: Natural-language policy search terms.

    Returns:
        Matching policy documents (full-text ranked), or `[]` when none match.
        On a lookup failure: `[{"error": "search_unavailable", ...}]`; on a
        blank query: `[{"error": "empty_query"}]`.
    """
    return await _search_policy_text(query)


async def get_recent_trace_summary(limit: int = 50) -> list[dict[str, Any]]:
    """Summarize the assistant's recent reasoning traces from Phoenix.

    GENUINE runtime Phoenix MCP usage: calls the `get-spans` tool over Streamable
    HTTP + OIDC via `claimit_mcp.call_phoenix_mcp_tool` (`PHOENIX_MCP_URL` injected
    at deploy time). Returns ONLY operation names, status codes, and counts —
    span attributes (which carry prompt/response content across users) are
    stripped by `summarize_recent_spans`, so no purchase/claim/policy content or
    other-user data can leak through this tool.

    Args:
        limit: Max recent spans to scan (1-200).

    Returns:
        A list of `{span_name, status_code, count}` summaries, or
        `[{"error": "phoenix_unavailable", "detail": <class>}]` on failure.
    """
    capped = max(1, min(limit, 200))
    try:
        result = await call_phoenix_mcp_tool(
            "get-spans",
            {
                "project_identifier": os.environ.get("PHOENIX_PROJECT_NAME", "claimit"),
                "limit": capped,
            },
        )
    except Exception as exc:
        return [{"error": "phoenix_unavailable", "detail": type(exc).__name__}]
    return summarize_recent_spans(result)


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
- `search_platform_policy(platform)` — exact lookup of ONE named platform's price-protection / price-match / best-rate-guarantee policy. Pass the platform identifier in lowercase with underscores (e.g. "hilton", "best_buy", "delta", "amazon"); identify it from the user's question. Returns the window, exclusions, claim method, and the relevant policy text. Use this when the user names a single platform.
- `search_policies_fulltext(query)` — full-text search across ALL platforms' policies. Use for broad / natural-language policy questions, clause / exclusion / window questions, or "which platforms ..." questions where you don't have a single exact platform name (e.g. "which platforms cover competitor price drops", "policies with a 24-hour window"). Pass natural-language search terms.
- Policy tool choice: named single platform → `search_platform_policy`; broad, fuzzy, or cross-platform policy questions → `search_policies_fulltext`. If one returns an error or no results, you may try the other before telling the user.
- `get_recent_trace_summary(limit=50)` — returns a sanitized summary (operation names, status codes, and counts only) of recent agent observability traces from Phoenix. Use for "what has the assistant been doing", "show recent activity / traces" style questions. It contains no purchase, claim, or policy content.

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
- For a policy question, call `search_platform_policy` first and answer only from what it returns. If it returns `[]`, say you don't have that platform's policy on file rather than guessing.
- If a tool returns `{"error": ...}`, explain honestly that the lookup failed and suggest the user try again. Do not retry blindly.
- If a tool returns no results, tell the user honestly.
"""

assistant_agent = Agent(
    name="assistant_agent",
    model="gemini-2.5-flash",
    instruction=MODE_A_SYSTEM_PROMPT,
    tools=[
        FunctionTool(get_all_purchases_for_user),
        FunctionTool(search_platform_policy),
        FunctionTool(search_policies_fulltext),
        FunctionTool(get_recent_trace_summary),
    ],
)
