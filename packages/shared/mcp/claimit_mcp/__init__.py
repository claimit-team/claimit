"""ClaimIt shared MCP toolset factories for ADK agents.

Public surface:

- `get_mongodb_mcp_toolset(read_only=True)` — picks transport from env.
  Returns a Streamable-HTTP toolset when `MDB_MCP_URL` is set (Agent
  Engine production path), otherwise a stdio toolset that spawns the
  Node `mongodb-mcp-server` as a child (local-dev path). See
  `mongodb.py` for the full transport selection rules.

- `get_phoenix_mcp_toolset()` — same transport selection driven by
  `PHOENIX_MCP_URL`, pointed at the `@arizeai/phoenix-mcp` Cloud Run
  bridge (stdio->HTTP supergateway). See `phoenix.py`.

- `GoogleIDTokenAuth` — `httpx.Auth` subclass that injects + refreshes
  Google OIDC ID tokens for Cloud Run service-to-service calls.
  Exported from the package root because future MCP servers behind
  Cloud Run will want the same auth wrapper.

- `get_elastic_mcp_toolset(tool_filter=None)` — Elastic Agent Builder MCP over
  Streamable HTTP to the Kibana `/api/agent_builder/mcp` endpoint. HTTP-only (no
  stdio, no Cloud Run, no OIDC); auth is a static `Authorization: ApiKey <key>`
  header from `ELASTIC_API_KEY` against `ELASTIC_KIBANA_URL`. MCP tool names
  equal the Agent Builder tool IDs defined in Kibana. See `elastic.py`.

- `call_mongodb_mcp_tool(tool_name, arguments)` /
  `call_phoenix_mcp_tool(tool_name, arguments)` /
  `call_elastic_mcp_tool(tool_name, arguments)` + `extract_tool_documents(result)`
  — the Gemini-friendly runtime path: open an authenticated Streamable-HTTP MCP
  session and invoke one tool programmatically, so a thin `FunctionTool` (clean
  schema) drives a *real* MCP call. Registering the raw toolset under Gemini
  fails because the upstream tool schemas (`const`/`oneOf`) are rejected by
  google-genai's function-calling schema (verified 2026-05-31).

- `read_claim_reasoning_spans(claim_id)` + `summarize_recent_spans(result)` and
  the `QueryResult` / `QueryStatus` / `SpanRecord` types — the Phoenix MCP read
  side that replaced the hand-rolled `claimit_observability.phoenix_client`.
"""

from .auth import GoogleIDTokenAuth
from .elastic import (
    call_elastic_mcp_tool,
    extract_agent_builder_documents,
    get_elastic_mcp_toolset,
)
from .mongodb import (
    call_mongodb_mcp_tool,
    extract_tool_documents,
    get_mongodb_mcp_toolset,
)
from .phoenix import (
    QueryResult,
    QueryStatus,
    SpanRecord,
    call_phoenix_mcp_tool,
    get_phoenix_mcp_toolset,
    read_claim_reasoning_spans,
    summarize_recent_spans,
)

__all__ = [
    "GoogleIDTokenAuth",
    "QueryResult",
    "QueryStatus",
    "SpanRecord",
    "call_elastic_mcp_tool",
    "call_mongodb_mcp_tool",
    "call_phoenix_mcp_tool",
    "extract_agent_builder_documents",
    "extract_tool_documents",
    "get_elastic_mcp_toolset",
    "get_mongodb_mcp_toolset",
    "get_phoenix_mcp_toolset",
    "read_claim_reasoning_spans",
    "summarize_recent_spans",
]
