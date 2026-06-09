# Security Model

ClaimIt handles Gmail access, purchase receipts, and price data. This document covers how authentication, authorization, and data protection are implemented.

---

## User Authentication — Firebase

All API requests require a valid Firebase ID token, verified server-side via `firebase_admin.auth.verify_id_token()`.

| Aspect | Implementation |
| --- | --- |
| **Token transport** | `Authorization: Bearer <token>` header, or `?token=<id_token>` query param (for SSE/EventSource clients that cannot set headers) |
| **Identity mapping** | Firebase `uid` → deterministic UUIDv5 → MongoDB `User._id`. Same user always maps to the same document (find-or-create upsert) |
| **Required claims** | `uid` and `email` must both be present — missing either returns 401 |
| **Error handling** | `InvalidIdTokenError` → 401; `UnavailableError` → 503; other `FirebaseError` → 401 |

---

## Inter-Service Authentication — OIDC

Pub/Sub push subscriptions and agent-to-agent HTTP calls use Google-minted OIDC tokens, verified by `verify_pubsub_oidc()`.

Three checks (all return 401 on failure):

1. **Audience** matches the configured push endpoint URL
2. **Caller SA email** matches the expected `pubsub-pusher` service account (`PUBSUB_PUSHER_SA_EMAIL`)
3. **`email_verified`** is `true` in the token claims

MCP services (MongoDB, Phoenix, Elastic) use the same OIDC pattern via httpx request event hooks, with Cloud Run `roles/run.invoker` as the edge gate.

---

## Gmail OAuth Scopes

ClaimIt requests the following OAuth scopes when a user connects Gmail:

| Scope | Purpose |
| --- | --- |
| `gmail.readonly` | Read inbound order confirmation emails for receipt ingestion |
| `gmail.send` | Send claim emails from the user's own Gmail account |
| `gmail.modify` | Label and mark processed messages to avoid re-ingestion |
| `openid` | Identity verification for the connected account |
| `userinfo.email` | Confirm the connected Gmail address |

The OAuth flow uses `access_type=offline` with `prompt=consent` to ensure a refresh token is issued. `include_granted_scopes` is deliberately omitted so the granted scope set exactly matches the request — no scope accumulation across re-authorizations.

---

## Token & Secret Storage

### Refresh Tokens → Secret Manager

- Each user's Gmail refresh token is stored as a **dedicated secret** in Google Cloud Secret Manager (one secret per user, auto-created on first connect)
- Encrypted at rest by Secret Manager (Google-managed keys)
- Only a **resource reference** is stored in MongoDB: `User.gmail_integration.refresh_token_ref` holds the `projects/{p}/secrets/{s}/versions/{n}` path — never the token value itself
- The reference is **stripped from all API responses** — `serializers.py` excludes it; no API endpoint ever returns the refresh token or its reference to the frontend

### Access Tokens → In-Memory Only

- Access tokens are **never persisted** to any database
- `AccessTokenCache` is an in-memory, per-Cloud-Run-instance cache with pre-expiry refresh (`_EXPIRY_SKEW_SECONDS`)
- When the cache misses or expires, a fresh access token is obtained from the refresh token via Secret Manager
- Per-instance scope is acceptable because the refresh token (in Secret Manager) is the source of truth

### Application Secrets

API keys, OAuth client secrets, state-JWT signing keys, and database URIs are injected from Secret Manager at deploy time. In the application, they are accessed via a lazily-initialized gRPC `SecretManagerServiceClient`. No plaintext long-lived credentials are stored in MongoDB.

---

## Data Protection

| Principle | Implementation |
| --- | --- |
| **No email sent without consent** | Every claim email requires explicit user approval, or a user-configured auto-send preference with a 5-minute cancellation window |
| **Tenancy in MCP tools** | Collection filters and query scopes are hard-coded in wrapper code — the model cannot pivot to other users' data |
| **Receipt data stays in GCP** | Receipt blobs are stored in GCS within the project boundary; extracted data in MongoDB Atlas |
| **Minimal data in responses** | Sensitive fields (refresh token refs, internal IDs) are stripped by serializers before API responses |

---

## CORS Configuration

CORS is configured via environment variables:

- `CORS_ALLOWED_ORIGINS`: comma-separated allowlist of permitted origins (no wildcard  origin)
- `CORS_ALLOWED_ORIGIN_REGEX`: optional regex for dynamic origin matching
- `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`

Wildcard methods/headers with credentials is broad but constrained by the explicit origin allowlist. Empty environment → no origins allowed (fails closed).

---

## Known Limitations

| Area | Status | Detail |
| --- | --- | --- |
| **Pub/Sub OIDC gap** | Known | `price.dropped` handler does not yet verify OIDC tokens (TODO in code). `claim.approved` and `claim.redraft_requested` handlers are verified. Edge-gated by Cloud Run IAM |
| **Gmail disconnect** | Known | Disconnect is a DB-only flag flip — the OAuth grant is not revoked with Google. User must manually revoke via Google Account settings |
| **Rate limiting scope** | By design | Applied only to public marketing/careers forms (in-memory sliding window, 1 submission per 5 minutes per IP). Authenticated API endpoints are not rate-limited at the application layer |
| **Single-tenant deployment** | Current state | The demo deployment uses a single shared account. Multi-tenant user isolation is planned |
| **Access token cache** | By design | Per-instance in-memory cache. Not shared across Cloud Run instances. Acceptable because refresh tokens in Secret Manager are the source of truth |

---

→ Back to [ClaimIt](../../README.md)
