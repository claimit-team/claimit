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
    audience = mcp_url.rstrip("/")
    connection_url = f"{audience}{_MCP_HTTP_PATH}"
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=connection_url,
            timeout=_HTTP_CONNECT_TIMEOUT_SECONDS,
            sse_read_timeout=_HTTP_READ_TIMEOUT_SECONDS,
            httpx_client_factory=_build_oidc_client_factory(audience),
        ),
    )


def _build_oidc_client_factory(audience: str):
    """Return an httpx client factory whose `AsyncClient` attaches a fresh Google
    OIDC ID token (audience = bare Cloud Run service URL) to every request.

    The token is injected by a `request` **event hook**, NOT httpx's client-level
    `auth=` flow. On Vertex AI Agent Engine the deployed mcp/httpx stack does not
    apply the `AsyncClient.auth` to Streamable-HTTP MCP requests (verified
    2026-05-31: pre-fix every POST /mcp reached Cloud Run unauthenticated -> 403,
    and `GoogleIDTokenAuth.sync_auth_flow` never ran). An event hook fires inside
    `client.send()` for every request unconditionally, so the bearer is always
    present. `_bearer()` is a cached, blocking metadata fetch minting a token for
    the *runtime* service account.

    Shared by `_http_toolset` (raw ADK toolset) and `call_mongodb_mcp_tool` (the
    Gemini-friendly FunctionTool path) so both authenticate identically.
    """
    # Local imports keep the stdio-only path import-cheap (no httpx /
    # google-auth pull-in until someone actually uses the HTTP transport).
    import httpx

    from .auth import GoogleIDTokenAuth

    oidc_auth = GoogleIDTokenAuth(audience=audience)

    async def _inject_oidc_header(request) -> None:
        request.headers["Authorization"] = f"Bearer {oidc_auth._bearer()}"

    def client_factory(
        headers: httpx.Headers | None = None,
        timeout: httpx.Timeout | None = None,
        auth: httpx.Auth | None = None,
    ) -> httpx.AsyncClient:
        # ADK / mcp call this factory with kwargs `headers`, `timeout`, `auth`
        # (the `auth` name matches AsyncClient's own param; renaming it broke
        # session creation — ticket 5.10 hotfix #3). We ignore the passed `auth`
        # and install our own via both `auth=` (for stacks that honor it) and
        # the event hook (which actually authenticates on Agent Engine).
        del auth
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
            event_hooks={"request": [_inject_oidc_header]},
        )

    return client_factory


async def call_mongodb_mcp_tool(
    tool_name: str,
    arguments: dict,
    *,
    mcp_url: str | None = None,
):
    """Open an authenticated Streamable-HTTP MCP session and invoke ONE tool.

    This is the Gemini-friendly runtime path. Registering the raw MongoDB MCP
    toolset fails under Gemini: `mongodb-mcp-server`'s `find`/`aggregate` input
    schemas use JSON-Schema `const`/`oneOf`, which google-genai's function-calling
    schema (`_ExtendedJSONSchema`) rejects (verified 2026-05-31, error 498 ->
    zero tools loaded). Instead, a thin ADK `FunctionTool` with a simple,
    Gemini-parseable signature calls this helper, so a *real* MongoDB MCP tool
    call still executes at runtime while the model only sees the wrapper schema.

    Auth reuses `_build_oidc_client_factory` (the event-hook OIDC fix). Reads the
    target service from `MDB_MCP_URL` unless `mcp_url` is given.

    Returns the raw mcp `CallToolResult`; use `extract_tool_documents` for dicts.
    """
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    resolved = (mcp_url or os.environ.get("MDB_MCP_URL", "")).strip()
    if not resolved:
        raise RuntimeError("MDB_MCP_URL not set; MongoDB MCP HTTP transport unavailable")
    audience = resolved.rstrip("/")
    url = f"{audience}{_MCP_HTTP_PATH}"
    factory = _build_oidc_client_factory(audience)
    async with (
        streamablehttp_client(url=url, httpx_client_factory=factory) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        return await session.call_tool(tool_name, arguments)


def extract_tool_documents(result) -> list[dict]:
    """Best-effort parse of an mcp `CallToolResult` into a list of dicts.

    `mongodb-mcp-server` returns query results as text content (JSON / EJSON).
    We collect each `TextContent`, parse JSON objects/arrays where possible, and
    fall back to a `{"text": ...}` wrapper so the caller always gets usable data.
    """
    import json

    docs: list[dict] = []
    texts: list[str] = []
    for item in getattr(result, "content", None) or []:
        text = getattr(item, "text", None)
        if text is None:
            continue
        texts.append(text)
        try:
            parsed = json.loads(text)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, list):
            docs.extend(d for d in parsed if isinstance(d, dict))
        elif isinstance(parsed, dict):
            docs.append(parsed)
    if docs:
        return docs
    return [{"text": t} for t in texts]


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
