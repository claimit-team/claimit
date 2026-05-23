"""MongoDB MCP toolset factory for ClaimIt ADK agents.

Two transports under one entry point:

- **stdio** (default, local-dev): launches the Node-based
  `mongodb-mcp-server` as a child process via `npx -y mongodb-mcp-server@
  latest`. Reads `MDB_MCP_CONNECTION_STRING` from the inherited
  environment. Suitable for `pytest`, local `uvicorn`, anything with a
  working Node installation.

- **streamable HTTP** (Agent Engine production path, ticket 5.10): if
  `MDB_MCP_URL` is set, the factory connects over MCP Streamable HTTP
  to a Cloud Run service running the same `mongodb-mcp-server` image
  with `--transport http`. The Cloud Run service is `roles/run.invoker`-
  gated; every request carries a fresh Google OIDC ID token via
  `GoogleIDTokenAuth` (see auth.py).

The HTTP path solves the "Agent Engine has no Node.js" problem without
forking the MCP architecture — the same upstream server image runs in
Cloud Run, the same MCP tool interface is exposed to the agent, only
the transport between agent and server changes.

Read-only segregation is enforced at the SERVER level (Option B from
the design discussion): two Cloud Run services exist — readonly and
readwrite — and the `read_only` parameter here is a hint for the
caller to pick which `MDB_MCP_URL` to set. On the HTTP path the
parameter is vestigial; the server itself decides what tools to
register. On the stdio path it still controls the `--readOnly` flag
passed to the child process.
"""

from __future__ import annotations

import os

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
    StreamableHTTPConnectionParams,
)
from mcp import StdioServerParameters

# Endpoint suffix the upstream mongodb-mcp-server registers for its
# Streamable HTTP transport. Verified in upstream source at
# https://github.com/mongodb-js/mongodb-mcp-server/blob/main/src/transports/mcpHttpServer.ts —
# the server `app.post("/mcp", ...)`, `app.get("/mcp", ...)`, and
# `app.delete("/mcp", ...)` on the configured http port. Don't include
# this in MDB_MCP_URL itself: `MDB_MCP_URL` is the bare Cloud Run
# service URL (which is also what the OIDC token's `aud` claim must
# match) and we append `/mcp` only for the MCP client connection.
_MCP_HTTP_PATH = "/mcp"

# Streamable HTTP transport timeouts. The MCP client establishes a
# session over a single HTTP connection and the server may stream
# responses back over SSE-framed chunks. The connection-establishment
# timeout (`timeout=`) only matters at session start; the per-read
# timeout (`sse_read_timeout=`) bounds how long a single tool call can
# block the agent. 60s for connect, 5 min for read leaves headroom for
# slow Mongo aggregations without making the agent wait forever on a
# stuck call.
_HTTP_CONNECT_TIMEOUT_SECONDS = 60.0
_HTTP_READ_TIMEOUT_SECONDS = 300.0


def get_mongodb_mcp_toolset(read_only: bool = True) -> McpToolset:
    """MongoDB MCP toolset factory — picks transport from env.

    - When `MDB_MCP_URL` is set: returns a Streamable-HTTP toolset
      pointed at that Cloud Run service URL, authenticated with a
      Google OIDC ID token whose audience matches the URL.
    - Otherwise: returns the legacy stdio toolset that spawns
      `npx mongodb-mcp-server@latest` as a child process. The
      `MDB_MCP_CONNECTION_STRING` env var must be present for that
      path.

    `read_only` controls the stdio path's `--readOnly` flag. On the
    HTTP path it's informational only — the deployed server already
    decides which tools to register; the caller is expected to point
    `MDB_MCP_URL` at the right (readonly vs readwrite) service.
    """
    mcp_url = os.environ.get("MDB_MCP_URL", "").strip()
    if mcp_url:
        return _http_toolset(mcp_url)
    return _stdio_toolset(read_only=read_only)


def _http_toolset(mcp_url: str) -> McpToolset:
    """Build a Streamable-HTTP MCP toolset with OIDC auth.

    The `httpx_client_factory` returns a fresh `AsyncClient` per session
    (ADK opens one client per `McpToolset` lifetime). The client's
    `auth=` is a `GoogleIDTokenAuth` instance whose audience is the
    bare service URL — NOT the `/mcp`-appended URL. OIDC audience
    convention is origin-scoped, not path-scoped, and Cloud Run's
    run.invoker validation checks the audience against the service URL
    without the path.
    """
    # Import locally to keep the stdio-only path import-cheap (no httpx
    # / google-auth pull-in until someone actually uses HTTP).
    import httpx

    from .auth import GoogleIDTokenAuth

    audience = mcp_url.rstrip("/")
    connection_url = f"{audience}{_MCP_HTTP_PATH}"
    oidc_auth = GoogleIDTokenAuth(audience=audience)

    def client_factory(
        headers: httpx.Headers | None = None,
        timeout: httpx.Timeout | None = None,
        auth: httpx.Auth | None = None,
    ) -> httpx.AsyncClient:
        # ADK's mcp session manager calls this factory with kwargs named
        # `headers`, `timeout`, `auth` — the `auth` kwarg matches
        # httpx.AsyncClient's own parameter name, so we accept it under
        # that exact name (renaming it caused TypeError at session
        # creation, ticket 5.10 hotfix #3). The kwarg `auth` here
        # shadows the closure capture deliberately; the OIDC auth we
        # actually want to install is bound to `oidc_auth` above, and
        # we always use it — ADK's `auth` (typically None) is ignored
        # because OIDC is a transport-layer concern the MCP client
        # itself doesn't need to know about.
        del auth  # explicit: we intentionally do not honor ADK's auth here
        return httpx.AsyncClient(
            headers=headers or {},
            timeout=timeout
            or httpx.Timeout(
                connect=_HTTP_CONNECT_TIMEOUT_SECONDS,
                read=_HTTP_READ_TIMEOUT_SECONDS,
                write=_HTTP_READ_TIMEOUT_SECONDS,
                pool=_HTTP_CONNECT_TIMEOUT_SECONDS,
            ),
            auth=oidc_auth,
        )

    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=connection_url,
            timeout=_HTTP_CONNECT_TIMEOUT_SECONDS,
            sse_read_timeout=_HTTP_READ_TIMEOUT_SECONDS,
            httpx_client_factory=client_factory,
        ),
    )


def _stdio_toolset(read_only: bool) -> McpToolset:
    """Build the legacy stdio MCP toolset (npx child process).

    Used for local dev + tests where `MDB_MCP_URL` is unset. The child
    inherits the parent's env so `MDB_MCP_CONNECTION_STRING` (set by
    the developer or the test harness) reaches the Node binary.
    """
    # Pin to npm's `latest` tag so npx resolves the registry on each
    # launch (without `@latest`, npx may return a cached binary). For a
    # stricter pin, swap "@latest" for a concrete version like "@1.10.0"
    # once a known-good version is in place.
    args = ["-y", "mongodb-mcp-server@latest"]
    if read_only:
        args.append("--readOnly")

    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command="npx",
                args=args,
                env=None,
            ),
            timeout=30,
        ),
    )
