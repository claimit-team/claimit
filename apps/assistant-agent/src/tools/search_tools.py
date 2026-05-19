"""Elastic search tools for the Assistant Agent.

These are ADK FunctionTools that wrap the shared SearchAdapter. Elastic does
not currently provide an MCP server, so we bridge it via FunctionTool while
MongoDB access goes through the MongoDB MCP toolset (consistent with all
other agents in the system).

The adapter is constructed and closed inside each tool call rather than held
on the agent. Tools are cloudpickled when deployed to Vertex AI Agent
Engines; holding a live HTTP client on the module would either fail to
pickle or smuggle a stale connection into the deployed bundle.
"""

from __future__ import annotations

from typing import Any

# Upper bounds on result-set size. The model can ask for any limit it wants
# but we silently clamp to keep prompt context tractable. Negative or zero
# limits are rejected loudly — that's always a coding bug in the agent prompt,
# never a legitimate query.
MAX_POLICY_LIMIT = 20
MAX_PURCHASE_LIMIT = 50


async def search_policies(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Search platform price-protection policies by keyword.

    Use this when the user asks about a specific platform's policy,
    exclusions, claim windows, or claim methods.

    Examples:
        "What is Best Buy's return window?"
        "Does Hilton require loyalty membership?"

    Args:
        query: Search keywords (e.g. "Best Buy exclusions", "hotel 24 hour window").
        limit: Maximum results to return. Defaults to 5.

    Returns:
        A list of matching policy documents (each is a dict of policy fields).
    """
    if limit < 1:
        raise ValueError("limit must be >= 1")
    limit = min(limit, MAX_POLICY_LIMIT)

    from search import get_search_adapter

    adapter = get_search_adapter()
    try:
        return await adapter.search_policies(query=query, limit=limit)
    finally:
        await adapter.close()


async def search_user_purchases(user_id: str, query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search a user's purchases by keyword (natural language).

    Use this when the user asks about a specific purchase using natural
    language rather than exact filters.

    Examples:
        "my Best Buy headphones order"
        "recent hotel bookings"

    Args:
        user_id: The authenticated user's ID — scopes the search to that user.
        query: Natural language query (e.g. "Sony headphones", "Hilton booking").
        limit: Maximum results. Defaults to 10.

    Returns:
        A list of matching purchase documents.
    """
    if limit < 1:
        raise ValueError("limit must be >= 1")
    limit = min(limit, MAX_PURCHASE_LIMIT)

    from search import get_search_adapter

    adapter = get_search_adapter()
    try:
        return await adapter.search_purchases(user_id=user_id, query=query, limit=limit)
    finally:
        await adapter.close()
