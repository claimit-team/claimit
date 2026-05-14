# claimit-mcp

Shared MCP toolset factories for ClaimIt ADK agents.

## Available factories

### `get_mongodb_mcp_toolset(read_only: bool = True)`

Wraps the upstream Node-based [`mongodb-mcp-server`][upstream] in an ADK
`McpToolset` so an agent can query (and optionally mutate) MongoDB through
the standard MCP tool-calling interface.

[upstream]: https://www.npmjs.com/package/mongodb-mcp-server

```python
from google.adk import Agent
from claimit_mcp import get_mongodb_mcp_toolset

assistant_agent = Agent(
    name="assistant_agent",
    model="gemini-2.0-flash",
    instruction="...",
    tools=[get_mongodb_mcp_toolset(read_only=True)],
)
```

| Agent     | `read_only` | Why                              |
| --------- | ----------- | -------------------------------- |
| ingest    | `False`     | writes `purchases`               |
| monitor   | `False`     | writes `price_history`           |
| claim     | `False`     | writes `claims`                  |
| assistant | `True`      | read-only — conversational query |

## Runtime requirements

- **Node.js** must be present on `PATH` inside the agent container — ADK launches
  the MCP server via `npx -y mongodb-mcp-server@latest`. The current Cloud Run
  Dockerfiles are Python-only; adding Node is a separate ticket.
- **`MONGODB_URI`** env var must be set; the factory raises `ValueError`
  otherwise. Cloud Run mounts it via Secret Manager (see
  `infra/terraform/main.tf` per-agent `secret_env_map`).

## Version pinning

The MCP server is invoked as `mongodb-mcp-server@latest` so npx resolves the
npm registry on each launch instead of falling back to a cached binary. For a
stricter pin (recommended for production), edit `mongodb.py` and swap `@latest`
for a concrete version such as `@0.1.2`.
