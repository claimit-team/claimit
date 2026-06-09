# MCP Integrations

ClaimIt uses three Model Context Protocol (MCP) integrations to give agents structured access to external systems. All three share a common design pattern established during development and reused across integrations.

---

## Shared Design Patterns

### Gemini-Safe Wrappers

Gemini (google-genai) rejects raw MCP tool schemas that use `const` or `oneOf` JSON Schema constructs — the model returns error 498 and registers zero tools. Each MCP integration is fronted by thin, hand-written ADK `FunctionTool` wrappers with simple, Gemini-parseable signatures. The wrapper calls the real MCP tool programmatically underneath.

### Event-Hook Auth

The deployed Agent Engine httpx/MCP stack silently drops client-level `auth=` parameters, causing requests to arrive unauthenticated (→ 403). All three MCPs inject authentication via an httpx **request event hook** (`client.send()` interceptor) instead. This was the root cause of the "opaque IAM 403" that originally blocked MongoDB MCP usage.

### Secrets at Request Time

API keys and tokens are read from environment variables at request time, not at import time. This prevents secrets from being baked into cloudpickle serialization (Agent Engine pickles agents for deployment) or appearing in Terraform state.

### Wrapper-Level Tenancy

Collection filters, query scopes, and result filtering are hard-coded in the wrapper layer — not passed as model-controlled arguments. The model cannot pivot queries to other users' data or access unauthorized collections.

---

## MongoDB MCP

**Purpose**: Exact-match lookup of platform price-protection policies stored in MongoDB Atlas.

|  |  |
| --- | --- |
| **Transport** | Streamable HTTP → Cloud Run (read-only MCP service) |
| **Auth** | OIDC bearer token via event hook (`_build_oidc_client_factory`) |
| **Agents** | All four (Ingest, Monitor, Claim, Assistant) |
| **Package** | `packages/shared/mcp/claimit_mcp/mongodb.py` |

### Tools

| Tool | Signature | Used By | Description |
| --- | --- | --- | --- |
| `search_platform_policy` | `(platform: str)` | Assistant | Named-platform policy lookup for conversational queries |
| `find_policy_for_platform` | `(platform: str)` | Ingest, Monitor, Claim | Same lookup used in pipeline agent tool definitions |

Both tools query the `policies` collection with a hard-coded filter on the `platform` field. The collection and filter are never model-controlled.

### Infrastructure

A single read-only Cloud Run MCP service (`mongodb-mcp-server`) serves all four agents. The original read-write service was retired and consolidated into this read-only instance. Per-user purchase data is accessed through a direct MongoDB query (closure-scoped in the Assistant), not through MCP.

---

## Phoenix MCP

**Purpose**: Runtime access to Arize Phoenix observability traces and spans — used by the Assistant to explain claim reasoning and surface self-evaluation scores.

|  |  |
| --- | --- |
| **Transport** | stdio→HTTP bridge via supergateway on Cloud Run |
| **Auth** | OIDC bearer token via event hook |
| **Agents** | All four (trace summary); Assistant + Claim (claim reasoning reads) |
| **Package** | `packages/shared/mcp/claimit_mcp/phoenix.py` |

### Why a Bridge?

`@arizeai/phoenix-mcp` is a Node.js stdio-only server. Agent Engine has no Node runtime. The solution: a [supergateway](https://github.com/nicholasgasior/supergateway) wrapper that bridges stdio→Streamable HTTP, deployed as a Cloud Run service. The `PHOENIX_API_KEY` is expanded from environment at runtime inside the bridge entrypoint, keeping the key out of process arguments and Terraform state.

### Tools

| Tool | Signature | Used By | Description |
| --- | --- | --- | --- |
| `get_recent_trace_summary` | `(limit: int = 50)` | All four | Sanitized summary: `{span_name, status_code, count}` only — span attributes are stripped to prevent cross-user content leakage |
| `read_claim_reasoning_spans` | `(claim_id: str)` | Assistant, Claim | Reads validator, self-eval, and Gemini call spans for a specific claim |

### Graceful Degradation

If the Phoenix bridge is unreachable, Mode B still answers from claim-document context. The response includes `phoenix_query_status: timeout` or `unavailable` — never a hard error. This was a deliberate design choice: Phoenix is an observability enhancement, not a critical dependency for claim review.

### Relationship to `claimit-observability`

The `claimit-observability` package (`init_phoenix`) handles the **write** side — exporting OTel spans to Phoenix via OTLP. The Phoenix MCP handles the **read** side — querying those spans back. They share the same Phoenix project but are otherwise independent: `init_phoenix` uses the OTLP HTTP exporter, while Phoenix MCP uses the Phoenix REST/MCP API through the bridge.

---

## Elastic MCP

**Purpose**: Full-text policy search across all platforms — the natural-language complement to MongoDB's exact-platform lookup.

|  |  |
| --- | --- |
| **Transport** | Streamable HTTP → Kibana Agent Builder endpoint |
| **Auth** | Static ApiKey header via event hook |
| **Agents** | Assistant only |
| **Package** | `packages/shared/mcp/claimit_mcp/elastic.py` |

### Tools

| Tool | Signature | Used By | Description |
| --- | --- | --- | --- |
| `search_policies_fulltext` | `(query: str)` | Assistant | Full-text search over `policies-fulltext` index; returns matched policy documents |

### Routing Logic

The Assistant uses prompt-level guidance to choose between MongoDB and Elastic:

- **Named platform** (e.g., "What's Best Buy's return policy?") → `search_platform_policy` via MongoDB MCP
- **Broad/fuzzy query** (e.g., "Which platforms allow price matching on electronics?") → `search_policies_fulltext` via Elastic MCP
- **Fallback**: If one source returns empty or errors, the Agent tries the other

### Error Handling

On search failure, the tool returns `{"error": "search_unavailable"}`. The error detail is the exception class name only — `str(exc)` is never used, preventing the Kibana URL from leaking into model-visible output.

### Result Parsing

Elastic's Agent Builder MCP returns results in an ES|QL envelope (`{results: [{esql_results, columns, values}]}`). The `extract_agent_builder_documents` helper unpacks this into flat row dicts that Gemini can reason over.

---

## Tool Availability by Agent

| Agent | MongoDB MCP | Phoenix MCP | Elastic MCP |
| --- | --- | --- | --- |
| **Ingest** | `find_policy_for_platform` | `get_recent_trace_summary` | — |
| **Monitor** | `find_policy_for_platform` | `get_recent_trace_summary` | — |
| **Claim** | `find_policy_for_platform` | `get_recent_trace_summary`, `read_claim_reasoning_spans` | — |
| **Assistant** | `search_platform_policy` | `get_recent_trace_summary`, `read_claim_reasoning_spans` | `search_policies_fulltext` |

---

## Key Files

| Path | Role |
| --- | --- |
| `packages/shared/mcp/claimit_mcp/mongodb.py` | MongoDB MCP toolset factory, OIDC client builder, Gemini-safe wrappers |
| `packages/shared/mcp/claimit_mcp/phoenix.py` | Phoenix MCP toolset factory, span summarizer, claim trace reader |
| `packages/shared/mcp/claimit_mcp/elastic.py` | Elastic MCP toolset factory, ES |
| `apps/phoenix-mcp/` | supergateway stdio→HTTP bridge for Phoenix MCP (Cloud Run) |

---

→ Back to [ClaimIt](../../README.md)
