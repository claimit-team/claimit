# Tech Stack Details

Version pins, package choices, and rationale for ClaimIt's technology stack.

---

## AI & Agent Framework

| Technology | Version | Role | Rationale |
| --- | --- | --- | --- |
| **Google Cloud Agent Builder** | — | Agent orchestration framework | Hackathon requirement; provides session management, tool registration, and agent lifecycle |
| **Gemini** | 2.5 Flash | All AI reasoning across the pipeline | Fast inference for streaming responses; sufficient quality for document parsing, draft generation, and self-evaluation |
| **Vertex AI** | — | Model hosting and Agent Engine runtime | Managed infrastructure for Agent Builder; provides `async_stream_query` for Mode A streaming |
| **Google ADK** | — | Agent Development Kit | Structured agent definition with `FunctionTool`, lifecycle hooks, and state management |

---

## Data Layer

| Technology | Version | Role | Rationale |
| --- | --- | --- | --- |
| **MongoDB Atlas** | M0 (free tier) | Primary data store — 6 collections | Document model fits the variable-schema nature of purchases across 24 platforms; Atlas provides managed hosting with built-in monitoring |
| **Motor** | async | MongoDB driver for Python | Native async support for FastAPI; wraps PyMongo for non-blocking database access |
| **Pydantic v2** | 2.x | Data validation and serialization | Type-safe model definitions shared between Python services; `model_validator` enforces cross-field invariants |
| **Elasticsearch** | — | Full-text policy search | Complements MongoDB's exact-match lookups with natural-language search across all platform policies |

---

## MCP Integrations

| MCP Server | Transport | Role |
| --- | --- | --- |
| **MongoDB MCP** (`mongodb-mcp-server`) | Streamable HTTP → Cloud Run | Agent-accessible policy lookup |
| **Phoenix MCP** (`@arizeai/phoenix-mcp`) | stdio→HTTP bridge → Cloud Run | Agent-accessible trace/span reading |
| **Elastic MCP** (Kibana Agent Builder) | Streamable HTTP → Kibana | Agent-accessible full-text policy search |

All three use Gemini-safe `FunctionTool` wrappers and request event-hook auth. See [MCP Integration Details](mcp_integrations.md).

---

## Event System

| Technology | Role | Rationale |
| --- | --- | --- |
| **Google Cloud Pub/Sub** | Inter-agent event bus — 8 topics + 8 DLQ topics | Decouples agents; push subscriptions with OIDC auth; built-in retry with dead-letter routing |
| **Google Cloud Scheduler** | Cron triggers — 3 jobs | `monitor-cron` */15 min → Monitor Agent; `claim-auto-send` every min → Claim Agent auto-send; `gmail-watch-renewal` daily 03:00 → Ingest Agent watch refresh |

---

## Compute

| Technology | Role | Rationale |
| --- | --- | --- |
| **Google Cloud Run** | Hosts 8 services: 4 agents + 3 support (sync-worker + 2 MCP bridges) + API gateway | Serverless scaling; pay-per-request; OIDC-gated inter-service auth |
| **Google Cloud Secret Manager** | API keys, OAuth tokens, DB credentials | Envmounted into services at runtime; secret values never in env files or Terraform state. api-gateway additionally reads per-user Gmail tokens via the SDK |
| **Vercel** | Hosts the Next.js frontend | Managed edge hosting (claimitai.vercel.app) |

---

## Frontend

| Technology | Version | Role | Rationale |
| --- | --- | --- | --- |
| **Next.js** | 16 | React framework with App Router | Server components, streaming SSR, API routes for BFF proxy |
| **TypeScript** | 5.x | Type safety | Shared types between API contract and UI components |
| **Tailwind CSS** | 4.x | Utility-first styling | Rapid iteration; consistent design tokens |
| **shadcn/ui** | — | Component library (Base UI primitives) | Accessible, unstyled components customized with Tailwind; uses `@base-ui/react` under the hood |
| **Zustand** | — | Client state management | Lightweight stores for auth, UI state, and proactive notifications |
| **Sonner** | — | Toast notifications | Minimal API; supports promise-based toasts for async operations |
| **Recharts** | — | Price history charts | Composable chart components for the evidence pane |

---

## Backend

| Technology | Version | Role | Rationale |
| --- | --- | --- | --- |
| **Python** | 3.12 | All backend services | Required by Google ADK; latest stable with improved performance |
| **FastAPI** | — | Web framework for all services | Native async, automatic OpenAPI docs, Pydantic integration |
| **Uvicorn** | — | ASGI server | Production-grade async server for FastAPI |
| **uv** | — | Python package manager | Fast dependency resolution; local path dependencies for monorepo shared packages |
| **httpx** | — | HTTP client | Async-first; used for inter-service calls and MCP communication |

---

## Authentication

| Technology | Role | Rationale |
| --- | --- | --- |
| **Firebase Authentication** | User sign-in (Google OAuth) | Managed auth with JWT verification; frontend SDK handles token refresh |
| **Gmail OAuth 2.0** | Receipt detection + claim email sending | Scoped access to user's Gmail; refresh tokens in Secret Manager |
| **OIDC (Cloud Run)** | Inter-service authentication | Pub/Sub push subscriptions and Mode B HTTP calls use OIDC tokens |

---

## Observability

| Technology | Role | Rationale |
| --- | --- | --- |
| **Arize Phoenix** | LLM observability platform | Hosted trace viewer; project-based span routing; REST API for programmatic access |
| **OpenTelemetry** | Distributed tracing SDK | Standard span creation and context propagation; OTLP HTTP export to Phoenix |
| **opentelemetry-instrumentation-httpx** | Auto-instrument outgoing HTTP calls | Captures Gemini API calls as child spans |
| **opentelemetry-instrumentation-pymongo** | Auto-instrument MongoDB queries | Captures database operations as child spans |

---

## Infrastructure & CI/CD

| Technology | Role | Rationale |
| --- | --- | --- |
| **Terraform** | Infrastructure as code | All GCP resources (Cloud Run, Pub/Sub, Scheduler, IAM, Secret Manager) defined declaratively |
| **GitHub Actions** | CI/CD pipelines | Lint, test, build, deploy on merge to `main` |
| **Docker** | Container images | Multi-stage builds for each Cloud Run service |
| **Ruff** | Python linter + formatter | Fast, opinionated; replaces flake8 + black + isort |
| **Biome** | Frontend linter | Fast, replaces ESLint for the Next.js app |

---

## Development Tools

| Technology | Role |
| --- | --- |
| **Cursor** | AI-assisted code editor — used for codebase recon and cross-validation |
| **Claude Code** | AI coding agent — used for implementation via terminal |
| **pnpm** | Frontend package manager (workspace-aware) |
| **nvm** | Node.js version management |
| **pyenv** | Python version management |
| **mongosh** | MongoDB shell for direct database operations |

---

→ Back to [ClaimIt](../../README.md)
