# Architecture

ClaimIt is a multi-agent system with five backend services, a frontend, and three external integrations (MongoDB, Phoenix, Elastic) accessed via MCP. Agents communicate through a Pub/Sub event bus — no agent calls another directly.

---

## System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend (Vercel)                        │
│  Dashboard · Three-Pane Claim Approval · Assistant Chat · Purchases   │
└─────────────────────────────┬─────────────────────────────────────────┘
                              │ REST + SSE
                   ┌──────────▼──────────┐
                   │    API Gateway      │──── Firebase Auth
                   │    (Cloud Run)      │──── Gmail OAuth
                   └──────────┬──────────┘
                              │ Pub/Sub Events
           ┌──────────────────┼──────────────────┐
           │                  │                  │
   ┌───────▼──────┐  ┌────────▼───────┐  ┌───────▼──────┐
   │ Ingest Agent │  │ Monitor Agent  │  │ Claim Agent  │
   │              │  │ + Scheduler    │  │              │
   └──────────────┘  └────────────────┘  └──────────────┘
                              │
                   ┌──────────▼──────────┐
                   │  Assistant Agent    │
                   │  (Mode A + Mode B)  │
                   └─────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
   ┌───────▼──────┐  ┌────────▼───────┐  ┌───────▼──────┐
   │ MongoDB MCP  │  │  Phoenix MCP   │  │ Elastic MCP  │
   │ (policies)   │  │  (traces)      │  │ (fulltext)   │
   └──────────────┘  └────────────────┘  └──────────────┘
```

---

## Services

| Service | Runtime | Role |
| --- | --- | --- |
| **API Gateway** | Cloud Run | BFF for the frontend — REST endpoints, SSE streaming, Firebase auth, Gmail OAuth, Pub/Sub publisher |
| **Ingest Agent** | Cloud Run | Parses receipts via Gemini, manages Gmail watch, publishes structured purchase data |
| **Monitor Agent** | Cloud Run + Cloud Scheduler | Tracks prices across platforms, captures screenshot evidence, resolves product URLs, detects drops |
| **Claim Agent** | Cloud Run | Generates claim drafts in four formats, runs Gemini self-evaluation, handles submission via Gmail API |
| **Assistant Agent** | Cloud Run + Agent Builder | Conversational AI with two modes — general help (Mode A) and claim-focused with tool access (Mode B) |

Each agent is detailed in its own document:

- [Ingest Agent](ingest_agent.md)
- [Monitor Agent](monitor_agent.md)
- [Claim Agent](claim_agent.md)
- [Assistant Agent](assistant_agent.md)

---

## Pub/Sub Event Topology

Seven topics drive the pipeline. Each topic has a matching `.dlq` dead-letter topic (max 5 delivery attempts, 7-day retention). Push subscriptions deliver events to Cloud Run agents via OIDC-authenticated HTTP.

### Event Flow

```
Gateway ── purchase.uploaded ──▶ Ingest Agent
Ingest  ── purchase.ingested ──▶ Monitor Agent + Web Frontend
Monitor ── price.dropped ──────▶ Claim Agent
Claim   ── claim.drafted ──────▶ Web Frontend
Gateway ── claim.approved ─────▶ Claim Agent
```

### Event Reference

| Event | Publisher | Subscriber | Triggers |
| --- | --- | --- | --- |
| `purchase.uploaded` | API Gateway | Ingest Agent | Gemini receipt extraction |
| `purchase.ingested` | Ingest Agent, API Gateway | Monitor Agent, Web Frontend | Price monitoring begins; dashboard updates |
| `price.dropped` | Monitor Agent | Claim Agent | Claim draft generation |
| `claim.drafted` | Claim Agent | Web Frontend | Proactive notification + approval UI |
| `claim.approved` | API Gateway, Claim Agent | Claim Agent | Platform submission (email send, etc.) |
| `claim.redraft_requested` | Assistant Agent | Claim Agent | Draft regeneration with user feedback |
| `claim.resolved` | *(provisioned, not yet wired)* | — | Reserved for outcome-based learning |

### Schema Consistency

Four events (`purchase.uploaded`, `purchase.ingested`, `price.dropped`, `claim.redraft_requested`) are defined as Pydantic models in `packages/shared/pubsub/claimit_pubsub/events.py`, validated via `EventEnvelope` with `schema_version`, `event_id`, and `emitted_at` fields.

The claim lifecycle events (`claim.drafted`, `claim.approved`) are constructed as inline dicts in their respective services. This is a known consistency gap — centralizing them into the shared package is planned.

---

## API Gateway

The gateway is the only service the frontend communicates with. It handles:

- **Authentication**: Firebase token verification on every request
- **REST endpoints**: CRUD for purchases, claims, conversations, notifications, user settings
- **SSE streaming**: Assistant chat responses streamed as Server-Sent Events
- **Pub/Sub publishing**: `purchase.uploaded`, `purchase.ingested`, `claim.approved` events
- **Gmail OAuth**: Token exchange, refresh, and `users.watch` registration
- **Optimistic updates**: Approve/cancel flows apply immediate state changes and rollback on downstream failure

The gateway does not contain AI logic — it delegates to agents via Pub/Sub events and direct HTTP (Assistant Agent Mode B).

---

## Shared Packages

All backend services consume shared packages from `packages/shared/`:

| Package | Purpose |
| --- | --- |
| `claimit-mongodb-models` | Pydantic models for all 6 MongoDB collections + `MongoDBClient` with Motor async driver |
| `claimit-pubsub` | Event envelope schemas + `PubSubPublisher` with retry and DLQ awareness |
| `claimit-mcp` | MCP toolset factories for MongoDB, Phoenix, and Elastic — Gemini-safe wrappers + event-hook auth |
| `claimit-observability` | Phoenix/OTel initialization (`init_phoenix`), tracer setup, span utilities |

Packages are installed as local path dependencies via `uv`. Interface changes require `[INTERFACE-CHANGE]` PR label and 24-hour review window.

---

## Deployment

| Component | Platform | Config |
| --- | --- | --- |
| Frontend | Vercel | Auto-deploy on push to `main` |
| 5 Backend services | Google Cloud Run | Terraform-managed, auto-scaling, OIDC-gated |
| Pub/Sub | Google Cloud | 7 topics + 7 DLQ topics + 7 push subscriptions |
| Scheduler | Google Cloud Scheduler | Cron triggers for monitoring cycles |
| Secrets | Google Cloud Secret Manager | API keys, OAuth tokens, DB credentials |
| Database | MongoDB Atlas M0 | Shared cluster, 6 collections |
| Observability | Arize Phoenix (hosted) | OTLP export from all services |
| DNS / CDN | Vercel Edge | Frontend only |

Infrastructure is defined in `infra/terraform/` and applied via GitHub Actions on merge to `main`.

---

## Error Handling Patterns

### Pub/Sub Delivery

- Push subscriptions retry with exponential backoff (Cloud Pub/Sub default)
- After 5 failed attempts → message moves to `.dlq` topic
- DLQ topics are provisioned but not yet consumed — they serve as a catch surface for debugging

### Agent-Level Rollback

- **API Gateway**: If Pub/Sub publish fails after a database write (e.g., approve), the gateway rolls back the MongoDB state to the previous outcome
- **Claim Agent**: If `submit_claim` fails (e.g., missing `recipient_email`), the handler rolls back `outcome` to `draft_pending` and writes the error to `outcome_note`
- **Monitor Agent**: If price adapter fails, the error is recorded in `last_monitor_error_code` on the purchase document; monitoring continues on the next cycle

### Graceful Degradation

- **Phoenix MCP**: If the bridge is unreachable, Mode B still answers from claim-document context with `phoenix_query_status: timeout|unavailable`
- **Elastic MCP**: On search failure, returns `{"error": "search_unavailable"}` — the Assistant falls back to MongoDB exact-platform lookup
- **Product URL Resolver**: If no match is found, the purchase stays in `monitoring` state with `product_url=None`; cron retries on subsequent ticks without notifying the user

---

→ Agent-specific documentation: [Ingest Agent](ingest_agent.md) · [Monitor Agent](monitor_agent.md)  · [Claim Agent](claim_agent.md)  · [Assistant Agent](assistant_agent.md)

→ [MCP Integrations](mcp_integrations.md) · [Data Model Reference](data_model_reference.md)
