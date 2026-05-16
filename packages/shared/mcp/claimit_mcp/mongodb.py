"""MongoDB MCP toolset factory for ClaimIt ADK agents.

Wraps the upstream `mongodb-mcp-server` (Node.js) as an ADK-compatible tool
collection. The server is launched via `npx -y mongodb-mcp-server` in a stdio
subprocess; ADK manages its lifecycle for the lifetime of the agent process.

Read-only mode is the default; agents that mutate collections (ingest, monitor,
claim) must pass `read_only=False`.
"""

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters


def get_mongodb_mcp_toolset(read_only: bool = True) -> McpToolset:
    """MongoDB MCP toolset factory.

    env=None lets the child process inherit the parent's environment.
    On Agent Engine runtime, MDB_MCP_CONNECTION_STRING is injected via
    SecretRef in deploy_agents.py. On Cloud Run, it comes from
    secret_env_map in Terraform. Either way, the URI is never baked
    into the toolset object (and therefore never into cloudpickle).
    """
    # Pin to npm's `latest` tag so npx resolves the registry on each launch
    # (without `@latest`, npx may return a cached binary). For a stricter pin,
    # swap "@latest" for a concrete version like "@0.1.2" once a known-good
    # version is in place.
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
