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
"""

from .auth import GoogleIDTokenAuth
from .mongodb import get_mongodb_mcp_toolset

__all__ = ["GoogleIDTokenAuth", "get_mongodb_mcp_toolset"]
