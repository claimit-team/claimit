"""ClaimIt shared MCP toolset factories for ADK agents.

Public surface:

- `get_mongodb_mcp_toolset(read_only=True)` — picks transport from env.
  Returns a Streamable-HTTP toolset when `MDB_MCP_URL` is set (Agent
  Engine production path), otherwise a stdio toolset that spawns the
  Node `mongodb-mcp-server` as a child (local-dev path). See
  `mongodb.py` for the full transport selection rules.

- `GoogleIDTokenAuth` — `httpx.Auth` subclass that injects + refreshes
  Google OIDC ID tokens for Cloud Run service-to-service calls.
  Exported from the package root because future MCP servers behind
  Cloud Run will want the same auth wrapper.

- `call_mongodb_mcp_tool(tool_name, arguments)` + `extract_tool_documents(result)`
  — the Gemini-friendly runtime path: open an authenticated Streamable-HTTP MCP
  session and invoke one tool programmatically, so a thin `FunctionTool` (clean
  schema) drives a *real* MongoDB MCP call. Registering the raw toolset under
  Gemini fails because `mongodb-mcp-server`'s `const`/`oneOf` tool schemas are
  rejected by google-genai's function-calling schema (verified 2026-05-31).
"""

from .auth import GoogleIDTokenAuth
from .mongodb import (
    call_mongodb_mcp_tool,
    extract_tool_documents,
    get_mongodb_mcp_toolset,
)

__all__ = [
    "GoogleIDTokenAuth",
    "call_mongodb_mcp_tool",
    "extract_tool_documents",
    "get_mongodb_mcp_toolset",
]
