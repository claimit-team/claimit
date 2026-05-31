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

from typing import Any

from claimit_mcp import call_mongodb_mcp_tool, extract_tool_documents
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


MONITOR_SYSTEM_PROMPT = (
    "You are the ClaimIt Monitor Agent. When asked about a platform's "
    "price-protection or price-match policy, call find_policy_for_platform "
    "with the platform identifier (lowercase, underscores — e.g. 'amazon', "
    "'best_buy', 'hilton') and summarize what it returns. If the lookup "
    "returns nothing, say you don't have that platform's policy on file. "
    "Never invent policy details."
)

monitor_agent = Agent(
    name="monitor_agent",
    model="gemini-2.5-flash",
    instruction=MONITOR_SYSTEM_PROMPT,
    tools=[FunctionTool(find_policy_for_platform)],
)
