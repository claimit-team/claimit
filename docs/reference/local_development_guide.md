# Local Development Guide

How to set up and run ClaimIt locally for development and testing.

---

## Prerequisites

| Tool | Version | Install |
| --- | --- | --- |
| **Python** | 3.12+ | `pyenv install 3.12` |
| **Node.js** | 20 LTS | `nvm install 20 && nvm use 20` |
| **pnpm** | 9+ | `npm install -g pnpm` |
| **uv** | latest | `curl -LsSf https://astral.sh/uv/install.sh | sh` |
| **Google Cloud SDK** | latest | [Install guide](https://cloud.google.com/sdk/docs/install) |
| **mongosh** | latest | `brew install mongosh` |

---

## Repository Setup

```bash
git clone https://github.com/claimit-team/claimit.git
cd claimit
```

---

## Frontend (Next.js)

### Pointing to deployed backend (recommended for UI work)

```bash
./scripts/fetch_env.sh web --force
pnpm --filter web dev
```

This configures `.env.local` to connect to the deployed Cloud Run BFF. The frontend runs at `http://localhost:3000`.

> ⚠️ This connects to **production data**. Mongo writes, Anthropic spend, Firebase users, and outbound Gmail sends are real. Do not trigger destructive flows unless intentional.
>

### Pointing to local backend

```bash
./scripts/fetch_env.sh web --force --local-backend
pnpm --filter web dev
```

This points the frontend to `http://localhost:8005` instead of the deployed BFF.

---

## Backend (API Gateway)

```bash
cd apps/api-gateway
cp .env.example .env.local    # Then fill in required values
uv sync
set -a && source .env.local && set +a
uv run uvicorn src.main:app --reload --port 8005
```

The gateway runs at `http://localhost:8005`. API docs available at `http://localhost:8005/docs`.

### Required environment variables

See `apps/api-gateway/.env.example` for the full list. Key variables:

| Variable | Source |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `FIREBASE_PROJECT_ID` | Firebase project for auth verification |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | Google OAuth credentials |
| `PHOENIX_API_KEY` | Arize Phoenix API key |
| `PHOENIX_COLLECTOR_ENDPOINT` | `https://app.phoenix.arize.com/s/claimitbeta/v1/traces` |
| `PHOENIX_PROJECT_NAME` | `claimit` |

---

## MongoDB Access

### Connection string

```bash
mongosh "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/claimit?appName=claimitbeta"
```

### UUID queries

Document `_id` fields are stored as UUID Binary type. Use the `UUID()` wrapper:

```jsx
// ✅ Correct
db.claims.findOne({ _id: UUID("467f2b31-f6af-4271-b714-ee00f1ed1d73") })

// ❌ Won't match
db.claims.findOne({ _id: "467f2b31-f6af-4271-b714-ee00f1ed1d73" })
```

---

## Agent Services

Each agent is a standalone FastAPI service. To run locally:

```bash
cd apps/<agent-name>
cp .env.example .env.local
uv sync
set -a && source .env.local && set +a
uv run uvicorn src.main:app --reload --port <port>
```

| Agent | Default Port | Notes |
| --- | --- | --- |
| API Gateway | 8005 | BFF for frontend |
| Ingest Agent | 8001 | Requires GCS access for receipt blobs |
| Monitor Agent | 8002 | Requires ScraperAPI key for live price checks |
| Claim Agent | 8003 | Requires Gmail OAuth for email sending |
| Assistant Agent | 8004 | Requires Vertex AI credentials for Agent Builder |

---

## Code Quality

### Python (all backend services)

```bash
# Format + lint (run before every commit)
uv run ruff format .
uv run ruff check .

# Tests
cd apps/<service>
uv run pytest tests/ -v
```

### Frontend

```bash
cd apps/web
npx tsc --noEmit          # Type check
pnpm run lint              # Biome lint
```

---

## Branch & PR Conventions

| Convention | Rule |
| --- | --- |
| **Branch naming** | `ws3/<description>` (e.g., `ws3/claim-agent-draft-generator`) |
| **Commit prefixes** | `feat` / `fix` / `chore` / `docs` / `refactor` / `test` |
| **Interface changes** | PRs touching shared packages must use `[INTERFACE-CHANGE]` prefix and allow 24-hour review |
| **PR target** | Always `dev` branch |
| **Review** | 1 reviewer + CI green required to merge |
| **Code review** | CodeRabbit automated review on all PRs |

---

## Common Operations

### Reset claim state for testing

```jsx
// In mongosh — reset specific claims to draft_pending
db.claims.updateMany(
  { _id: { $in: [UUID("..."), UUID("...")] } },
  { $set: { outcome: "draft_pending", submitted_at: null, submitted_via: null },
    $unset: { auto_send_at: "" } }
)
```

### Check deployment status

```bash
gh run list --limit 5
```

### Fetch latest dev and clean branches

```bash
git checkout dev && git pull --rebase origin dev
git remote prune origin
```

---

## Troubleshooting

| Issue | Solution |
| --- | --- |
| `nvm: command not found` | Install nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash` |
| `uv: command not found` | Install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh` |
| `mongosh: command not found` | `brew install mongosh` |
| Node version mismatch | `nvm use 20` — Next.js 16 requires Node 20+ |
| CI lint failures | Run `uv run ruff format . && uv run ruff check .` locally before pushing |
| `uv.lock` confusion | `uv.lock` does not need updating when only adding Python code to existing packages (local path deps) |
| MongoDB UUID queries return nothing | Use `UUID("...")` wrapper — `_id` fields are Binary UUID, not strings |
| Firebase auth errors locally | Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account JSON |
| SSE connection drops | Check Node version (`nvm use 20`) and that the backend is running |

---

→ Back to [ClaimIt](../../README.md)
