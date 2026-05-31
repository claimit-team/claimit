"""ADK agent for the monitor service — MongoDB MCP read-courier.

Demonstrates a REAL MongoDB MCP `find` tool call at runtime. The raw MongoDB MCP
toolset cannot be registered directly with Gemini: `mongodb-mcp-server`'s
`find`/`aggregate` input schemas use JSON-Schema `const`/`oneOf`, which
google-genai's function-calling schema rejects (verified 2026-05-31, error 498 ->
zero tools loaded). So `find_policy_for_platform` exposes a simple, Gemini-parseable
signature whose implementation calls the MCP `find` tool over Streamable HTTP + OIDC
via `claimit_mcp.call_mongodb_mcp_tool`. `MDB_MCP_URL` is injected at deploy time
(scripts/deploy_agents.py) pointing at the read MongoDB MCP Cloud Run service.

Cloudpickle constraints (mirror the assistant agent.py):
- NO `from __future__ import annotations` — cloudpickle's function pickler ships
  only globals referenced in bytecode, so annotation-only names (`Any`) would be
  dropped and raise NameError when ADK resolves type hints on the restored agent.
- Absolute imports only — deploy_agents.py loads this file standalone via
  importlib.exec_module, with no parent-package context.
- `call_mongodb_mcp_tool` / `extract_tool_documents` come from the installed
  `claimit_mcp` wheel, so cloudpickle-by-value resolves them by reference at restore.
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
    """Look up a platform's price-protection policy via MongoDB MCP.

    Calls the MongoDB MCP `find` tool against the global `policies` collection.
    Policies are global (no per-user scoping), so this is safe to expose.

    Args:
        platform: Platform identifier, e.g. "amazon", "best_buy", "hilton".

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


MONITOR_SYSTEM_PROMPT = (
    "You are the ClaimIt Monitor Agent. When asked about a platform's "
    "price-protection or price-match policy, call find_policy_for_platform "
    "with the platform identifier (lowercase, underscores — e.g. 'amazon', "
    "'best_buy', 'hilton') and summarize what it returns. If the lookup "
    "returns nothing, say you don't have that platform's policy on file. "
    "Never invent policy details. For questions about recent agent activity "
    "or observability traces, call get_recent_trace_summary."
)

monitor_agent = Agent(
    name="monitor_agent",
    model="gemini-2.5-flash",
    instruction=MONITOR_SYSTEM_PROMPT,
    tools=[
        FunctionTool(find_policy_for_platform),
        FunctionTool(get_recent_trace_summary),
    ],
)
