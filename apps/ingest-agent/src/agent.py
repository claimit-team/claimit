"""ADK agent for the ingest service — MongoDB MCP read-courier.

Demonstrates a REAL MongoDB MCP `find` tool call at runtime. The raw MongoDB MCP
toolset cannot be registered with Gemini (its `find`/`aggregate` input schemas use
JSON-Schema `const`/`oneOf`, rejected by google-genai function-calling — verified
2026-05-31, error 498). So `find_policy_for_platform` exposes a simple,
Gemini-parseable signature whose implementation calls the MCP `find` tool over
Streamable HTTP + OIDC via `claimit_mcp.call_mongodb_mcp_tool`. `MDB_MCP_URL` is
injected at deploy time (scripts/deploy_agents.py).

Reading a platform's policy mirrors the real ingest flow (finalize.py fetches the
policy to compute the price-protection window), and `policies` is a global
collection (no per-user PII; the collection/filter shape is hard-coded, never an
LLM arg), so it is safe to expose. Per-user purchase reads are intentionally NOT
exposed via MCP: `user_id` is stored as a BSON UUID that a plain-JSON MCP filter
can't match, and per-user PII reads belong on a closure-scoped direct path.

Cloudpickle constraints (mirror the assistant agent.py): NO `from __future__ import
annotations`; absolute imports only; `call_mongodb_mcp_tool` / `extract_tool_documents`
resolve from the installed `claimit_mcp` wheel at restore.
"""

from typing import Any

from claimit_mcp import call_mongodb_mcp_tool, extract_tool_documents
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


INGEST_SYSTEM_PROMPT = (
    "You are the ClaimIt Ingest Agent. When you need a platform's "
    "price-protection policy (e.g. to determine a purchase's monitoring window), "
    "call find_policy_for_platform with the platform identifier (lowercase, "
    "underscores — e.g. 'amazon', 'best_buy', 'hilton') and use only what it "
    "returns. If the lookup returns nothing, say you don't have that platform's "
    "policy on file. Never invent policy terms."
)

ingest_agent = Agent(
    name="ingest_agent",
    model="gemini-2.5-flash",
    instruction=INGEST_SYSTEM_PROMPT,
    tools=[FunctionTool(find_policy_for_platform)],
)
