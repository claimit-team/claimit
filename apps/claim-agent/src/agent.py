"""ADK agent for the claim service — MongoDB MCP read-courier.

Demonstrates a REAL MongoDB MCP `find` tool call at runtime. The raw MongoDB MCP
toolset cannot be registered with Gemini (its `find`/`aggregate` input schemas use
JSON-Schema `const`/`oneOf`, rejected by google-genai function-calling — verified
2026-05-31, error 498). So `find_policy_for_platform` exposes a simple,
Gemini-parseable signature whose implementation calls the MCP `find` tool over
Streamable HTTP + OIDC via `claimit_mcp.call_mongodb_mcp_tool`. `MDB_MCP_URL` is
injected at deploy time (scripts/deploy_agents.py).

Reading a platform's policy mirrors the real claim flow (main.py fetches the policy
to draft against), and `policies` is a global collection (no per-user PII; the
collection/filter shape is hard-coded, never an LLM arg), so it is safe to expose.

Cloudpickle constraints (mirror the assistant agent.py): NO `from __future__ import
annotations`; absolute imports only; `call_mongodb_mcp_tool` / `extract_tool_documents`
resolve from the installed `claimit_mcp` wheel at restore.
"""

import os
from typing import Any

from claimit_mcp import (
    call_mongodb_mcp_tool,
    call_phoenix_mcp_tool,
    extract_tool_documents,
    summarize_recent_spans,
)
from google.adk import Agent
from google.adk.tools import FunctionTool


async def find_policy_for_platform(platform: str) -> list[dict[str, Any]]:
    """Look up a platform's price-protection / price-match policy via MongoDB MCP.

    Args:
        platform: Platform identifier, lowercase with underscores
            (e.g. "amazon", "best_buy", "hilton").

    Returns:
        Matching policy documents (usually one), or an empty list if none match.
    """
    result = await call_mongodb_mcp_tool(
        "find",
        {
            "database": "claimit",
            "collection": "policies",
            "filter": {"platform": platform},
            "limit": 1,
        },
    )
    return extract_tool_documents(result)


async def get_recent_trace_summary(limit: int = 50) -> list[dict[str, Any]]:
    """Summarize this agent's recent reasoning traces from Phoenix (observability).

    GENUINE runtime Phoenix MCP usage: calls the `get-spans` tool over Streamable
    HTTP + OIDC via `claimit_mcp.call_phoenix_mcp_tool` (`PHOENIX_MCP_URL` injected
    at deploy time). Returns ONLY operation names, status codes, and counts —
    span attributes (which carry prompt/response content across users) are
    stripped by `summarize_recent_spans`, so this is safe to expose to the model.

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


CLAIM_SYSTEM_PROMPT = (
    "You are the ClaimIt Claim Agent. When you need a platform's price-protection "
    "or price-match policy to reason about a claim, call find_policy_for_platform "
    "with the platform identifier (lowercase, underscores — e.g. 'best_buy', "
    "'hilton', 'amazon') and use only what it returns. If the lookup returns "
    "nothing, say you don't have that platform's policy on file. Never invent "
    "policy terms. For questions about recent agent activity or observability "
    "traces, call get_recent_trace_summary."
)

claim_agent = Agent(
    name="claim_agent",
    model="gemini-2.5-flash",
    instruction=CLAIM_SYSTEM_PROMPT,
    tools=[
        FunctionTool(find_policy_for_platform),
        FunctionTool(get_recent_trace_summary),
    ],
)
