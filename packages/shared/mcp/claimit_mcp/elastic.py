"""Elastic Agent Builder MCP toolset factory for ClaimIt ADK agents.

Unlike mongodb.py / phoenix.py, this server is HTTP-native and externally
hosted: Kibana Agent Builder exposes its tools at a REST endpoint
(`{KIBANA_URL}/api/agent_builder/mcp`, or the space-scoped
`{KIBANA_URL}/s/{SPACE}/api/agent_builder/mcp`). Consequences:

- **No stdio transport / no Cloud Run / no OIDC.** There is no npx server to
  spawn (so no local-dev stdio fallback) and no run.invoker-gated Cloud Run
  hop. Auth is a STATIC Elasticsearch API key in an `Authorization: ApiKey
  <key>` header — the runtime SA never mints a token here.
- **Tool names equal Kibana tool IDs.** You first DEFINE Agent Builder tools in
  Kibana (ES|QL / index-search tools); the MCP server exposes exactly those.
  `call_elastic_mcp_tool("search_policies", {...})` therefore requires a Kibana
  tool whose id is `search_policies` with a matching param schema.

We reuse the MongoDB MCP HTTP timeouts so all three MCP integrations frame
requests with the same connect/read budget. We do NOT reuse
`_build_oidc_client_factory` (that mints OIDC bearers for a Cloud Run audience);
`_build_api_key_client_factory` injects the static `ApiKey` header instead — but
via the SAME request EVENT HOOK mechanism, because the Agent-Engine httpx/mcp
stack does not reliably carry construction-time client state onto the
Streamable-HTTP MCP request (verified 2026-05-31 for OIDC; the hook is the only
place a header is guaranteed to reach the wire). The key is read from
`ELASTIC_API_KEY` AT REQUEST TIME inside the hook (not captured in a closure
variable), so no secret is serialized if a toolset is ever cloudpickled.

cloudpickle note: like the other factories, keep construction lazy/module-level
and read env at call time. The assistant does NOT register this raw toolset
(Gemini rejects rich MCP schemas) — it uses the thin-FunctionTool +
`call_elastic_mcp_tool` path — so the import-time pickle trap does not bite the
assistant today; the factory exists for parity and local/manual use.
"""

from __future__ import annotations

import os

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

# Reuse the MongoDB MCP HTTP connect/read budget so all three MCP servers frame
# requests identically. We deliberately do NOT import `_MCP_HTTP_PATH` ("/mcp")
# — Kibana's Agent Builder path is a full REST path, defined below.
from .mongodb import (
    _HTTP_CONNECT_TIMEOUT_SECONDS,
    _HTTP_READ_TIMEOUT_SECONDS,
    extract_tool_documents,
)

# Kibana Agent Builder MCP endpoint suffix on the Kibana base URL. Documented at
# https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/mcp-server.
# Unlike MongoDB MCP's "/mcp" appended to a bare Cloud Run service URL, this is a
# full Kibana REST path; the space-scoped form prefixes "/s/{space}".
_MCP_HTTP_PATH = "/api/agent_builder/mcp"

# Default Agent Builder tools the assistant exposes. Phase 1 ships only
# search_policies (global policy data, no tenancy risk). aggregate_claims is a
# documented Phase 2 follow-up; per-user purchase search is intentionally absent
# (it would need a session-driven user_id baked into the Kibana tool, never an
# LLM-fillable arg).
_DEFAULT_TOOL_FILTER = ["search_policies"]


def _mcp_url(kibana_url: str) -> str:
    """Build the full Streamable-HTTP MCP URL from a bare Kibana base URL.

    Honors an optional `ELASTIC_KIBANA_SPACE` for the space-scoped endpoint.
    """
    base = kibana_url.rstrip("/")
    space = os.environ.get("ELASTIC_KIBANA_SPACE", "").strip()
    if space:
        return f"{base}/s/{space}{_MCP_HTTP_PATH}"
    return f"{base}{_MCP_HTTP_PATH}"


def _build_api_key_client_factory():
    """Return an httpx client factory whose `AsyncClient` attaches a static
    `Authorization: ApiKey <ELASTIC_API_KEY>` header to every request.

    Mirrors `mongodb._build_oidc_client_factory`'s SHAPE (and the request-event-
    hook fix) but swaps the per-request OIDC mint for the static API key, read
    from the environment AT REQUEST TIME inside the hook. Reading env in the
    hook (rather than capturing the key in a closure variable) means no secret
    is serialized if a toolset built from this factory is ever cloudpickled.

    Why the event hook and not just `headers=`: on Agent Engine the deployed
    mcp/httpx stack was proven to drop the client-level `auth=` flow
    (2026-05-31, OIDC), and the mcp client may rebuild request headers per send.
    The event hook fires inside `client.send()` unconditionally, so the header
    is always on the wire. We set `headers=` too (belt-and-suspenders).

    Shared by `get_elastic_mcp_toolset` and `call_elastic_mcp_tool` so both
    authenticate identically.
    """
    # Local import keeps the module import-cheap (mongodb.py rationale).
    import httpx

    def _api_key_header() -> str:
        return f"ApiKey {os.environ.get('ELASTIC_API_KEY', '').strip()}"

    async def _inject_api_key(request) -> None:
        request.headers["Authorization"] = _api_key_header()

    def client_factory(
        headers: httpx.Headers | None = None,
        timeout: httpx.Timeout | None = None,
        auth: httpx.Auth | None = None,
    ) -> httpx.AsyncClient:
        # ADK / mcp call this factory with kwargs `headers`, `timeout`, `auth`
        # (the `auth` name matches AsyncClient's own param; renaming it broke
        # mongodb session creation — ticket 5.10 hotfix #3). A static header
        # needs no httpx.Auth, so we drop the passed `auth`.
        del auth
        merged = dict(headers or {})
        merged["Authorization"] = _api_key_header()
        return httpx.AsyncClient(
            headers=merged,
            timeout=timeout
            or httpx.Timeout(
                connect=_HTTP_CONNECT_TIMEOUT_SECONDS,
                read=_HTTP_READ_TIMEOUT_SECONDS,
                write=_HTTP_READ_TIMEOUT_SECONDS,
                pool=_HTTP_CONNECT_TIMEOUT_SECONDS,
            ),
            event_hooks={"request": [_inject_api_key]},
        )

    return client_factory


def get_elastic_mcp_toolset(tool_filter: list[str] | None = None) -> McpToolset:
    """Agent Builder MCP toolset over Streamable HTTP (Kibana endpoint).

    Reads `ELASTIC_KIBANA_URL` (the Kibana base URL of the Elastic Cloud
    deployment) and `ELASTIC_API_KEY` (an ES API key with
    feature_agentBuilder.read + feature_actions.read on the target space).
    HTTP-only — there is no stdio fallback (Agent Builder is a REST endpoint,
    not an npx server).

    Auth is a static `Authorization: ApiKey <key>` header injected via a request
    event hook (see `_build_api_key_client_factory`). No OIDC, no Cloud Run —
    Kibana is external and validates the API key itself.

    Note: agents do NOT register this raw toolset (Gemini function-calling
    rejects rich MCP tool schemas — const/oneOf → error 498, zero tools). They
    register a thin `FunctionTool` that calls `call_elastic_mcp_tool`. This
    factory exists for parity with the other servers and for local use.
    """
    kibana = os.environ.get("ELASTIC_KIBANA_URL", "").strip()
    if not kibana:
        raise RuntimeError("ELASTIC_KIBANA_URL not set; Agent Builder MCP unavailable")
    if not os.environ.get("ELASTIC_API_KEY", "").strip():
        raise RuntimeError("ELASTIC_API_KEY not set; Agent Builder MCP needs an API key")
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=_mcp_url(kibana),
            timeout=_HTTP_CONNECT_TIMEOUT_SECONDS,
            sse_read_timeout=_HTTP_READ_TIMEOUT_SECONDS,
            httpx_client_factory=_build_api_key_client_factory(),
        ),
        tool_filter=tool_filter if tool_filter is not None else _DEFAULT_TOOL_FILTER,
    )


async def call_elastic_mcp_tool(
    tool_name: str,
    arguments: dict,
    *,
    kibana_url: str | None = None,
):
    """Open an authenticated Streamable-HTTP MCP session and invoke ONE tool.

    The Gemini-friendly runtime path (mirrors `mongodb.call_mongodb_mcp_tool` /
    `phoenix.call_phoenix_mcp_tool`): a thin ADK `FunctionTool` with a clean,
    Gemini-parseable signature calls this helper so a REAL Agent Builder MCP
    tool executes at runtime while the model only sees the wrapper schema.

    `tool_name` MUST match an Agent Builder tool id defined in Kibana (e.g.
    "search_policies"); `arguments` must match that tool's param schema. Reads
    `ELASTIC_KIBANA_URL` / `ELASTIC_API_KEY` from env unless `kibana_url` is
    given (the key always comes from env, via the auth hook).

    Returns the raw mcp `CallToolResult`; use `extract_tool_documents` to parse.
    """
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    resolved_url = (kibana_url or os.environ.get("ELASTIC_KIBANA_URL", "")).strip()
    if not resolved_url:
        raise RuntimeError("ELASTIC_KIBANA_URL not set; Agent Builder MCP unavailable")
    if not os.environ.get("ELASTIC_API_KEY", "").strip():
        raise RuntimeError("ELASTIC_API_KEY not set; Agent Builder MCP needs an API key")

    url = _mcp_url(resolved_url)
    factory = _build_api_key_client_factory()
    async with (
        streamablehttp_client(url=url, httpx_client_factory=factory) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        return await session.call_tool(tool_name, arguments)


def extract_agent_builder_documents(result) -> list[dict]:
    """Parse an Agent Builder MCP CallToolResult into a list of row dicts.

    Agent Builder does NOT return a flat JSON array like mongodb-mcp; it wraps
    tool output in `{"results": [{"type": ..., "data": ...}, ...]}`. For an ES|QL
    / index-search tool the rows live in the entry whose `data` carries `columns`
    (a list of `{"name", "type"}`) and `values` (a list of row arrays) — verified
    live against Kibana 9.4.1 (`type: "esql_results"`). We zip columns+values into
    `{column_name: value}` dicts so the LLM-facing tool returns clean policy
    documents.

    Falls back to `extract_tool_documents` for any other shape (a non-tabular tool,
    or a tool that already returns a flat JSON array), so this is safe to use as the
    single parser for every Agent Builder tool.
    """
    for doc in extract_tool_documents(result):
        if not isinstance(doc, dict):
            continue
        results = doc.get("results")
        if not isinstance(results, list):
            continue
        for entry in results:
            data = entry.get("data") if isinstance(entry, dict) else None
            if not isinstance(data, dict):
                continue
            columns = data.get("columns")
            values = data.get("values")
            if isinstance(columns, list) and isinstance(values, list):
                names = [c.get("name") if isinstance(c, dict) else str(c) for c in columns]
                rows: list[dict] = []
                for row in values:
                    if isinstance(row, list):
                        rows.append({names[i]: row[i] for i in range(min(len(names), len(row)))})
                return rows
    # No tabular entry found — fall back to the generic TextContent-JSON parser.
    return extract_tool_documents(result)
