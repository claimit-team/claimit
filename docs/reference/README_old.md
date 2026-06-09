# ClaimIt

[![CI](https://github.com/claimit-team/claimit/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/claimit-team/claimit/actions/workflows/ci.yml)
[![Deploy Agents](https://github.com/claimit-team/claimit/actions/workflows/deploy-agents.yml/badge.svg)](https://github.com/claimit-team/claimit/actions/workflows/deploy-agents.yml)
[![Deploy Prod](https://github.com/claimit-team/claimit/actions/workflows/deploy-prod.yml/badge.svg)](https://github.com/claimit-team/claimit/actions/workflows/deploy-prod.yml)
[![Keepalive](https://github.com/claimit-team/claimit/actions/workflows/keepalive.yml/badge.svg)](https://github.com/claimit-team/claimit/actions/workflows/keepalive.yml)
[![Slack Notifications](https://github.com/claimit-team/claimit/actions/workflows/slack-notify.yml/badge.svg)](https://github.com/claimit-team/claimit/actions/workflows/slack-notify.yml)
[![Terraform Plan](https://github.com/claimit-team/claimit/actions/workflows/terraform-plan.yml/badge.svg)](https://github.com/claimit-team/claimit/actions/workflows/terraform-plan.yml)

AI agent that monitors post-purchase prices and auto-generates refund claims across multiple platforms.

Built for the Google Cloud Rapid Agent Hackathon.

## Documentation

All product, technical, and planning docs live in Notion:

- [Master Document (V2 ClaimIt Proposal)](https://www.notion.so/V2-ClaimIt-Proposal-35c134f951b580eea33bd19bef043417)
- [Implementation Plan](https://www.notion.so/ClaimIt-Implementation-Plan-35d134f951b58053aeb2dccb98b61c11)
- [Kanban Board (Tickets)](https://www.notion.so/ClaimIt-Kanban-35e134f951b580a487c1f97c8fac6c97)

## Tech Stack

- Frontend: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Zustand
- Backend: Python 3.12, FastAPI, Pydantic v2, Motor
- LLM: Gemini 2.5 Flash via Google Cloud Agent Builder
- Data: MongoDB Atlas, Elasticsearch
- Observability: Arize Phoenix (OpenTelemetry)
- Infra: Google Cloud (Cloud Run, Pub/Sub, Cloud Scheduler, Secret Manager)
- IaC: Terraform
- CI/CD: GitHub Actions

## Live Demo

- **Frontend:** https://claimitai.vercel.app (Vercel default — custom domain intentionally deferred)
- **Cloud Run APIs:** see infra/terraform/main.tf for service URLs

## Partner Tracks

- MongoDB (primary)
- Elastic (secondary)
- Arize Phoenix (observability)

## Team

- Erdun
- Will (Wan Qingyuan)
- Raj Kavathekar
- Chris

## Repository Structure

See [Implementation Plan Attachment 3 §8](https://www.notion.so/ClaimIt-Implementation-Plan-35d134f951b58053aeb2dccb98b61c11) for the full repo structure and tooling decisions.

## Getting Started

### Prerequisites

Install once on your machine (skip if already present):

- **Node 20 + pnpm 9** via [volta](https://volta.sh):

  ```bash
  brew install volta
  volta install node@20 pnpm@9
  ```

- **Python tooling** via [uv](https://docs.astral.sh/uv/):

  ```bash
  brew install uv
  ```

### One-command setup

After cloning, run:

```bash
git clone https://github.com/claimit-team/claimit
cd claimit
./scripts/setup.sh
```

This:

- Verifies Node, pnpm, uv versions
- Runs `pnpm install` (postinstall hook auto-installs pre-commit)
- Sets up git hooks
- Validates everything works

**Working on Python agents?** Add `--with-python` to install all 4 agents (~300MB):

```bash
./scripts/setup.sh --with-python
```

Or sync individual agents on demand:

```bash
cd apps/ingest-agent && uv sync
```

### Daily workflow

```bash
# After git pull, just run pnpm install — postinstall hook handles pre-commit
pnpm install
```

### Running services locally

```bash
# Frontend (port 3000)
pnpm --filter web dev

# Backend services (one per terminal)
cd apps/api-gateway     && uv run uvicorn src.main:app --reload --port 8005
cd apps/ingest-agent    && uv run uvicorn src.main:app --reload --port 8001
cd apps/monitor-agent   && uv run uvicorn src.main:app --reload --port 8002
cd apps/claim-agent     && uv run uvicorn src.main:app --reload --port 8003
cd apps/assistant-agent && uv run uvicorn src.main:app --reload --port 8004
cd apps/sync-worker     && uv run uvicorn src.main:app --reload --port 8006
```

### Local end-to-end development

The frontend and every backend service read config from a `.env.local` file in
their respective app directory. `scripts/fetch_env.sh` pulls the values out of
Google Secret Manager and assembles a ready-to-go `.env.local`, so any teammate
with `gcloud` access can run the full stack locally without merging to test.

See **[docs/local-testing.md](docs/local-testing.md)** for the full walkthrough
(troubleshooting, mode switching, known limitations). TL;DR below.

> ⚠️  **Everything below talks to PROD `claimit-beta`.** There is no
> separate dev environment. Mongo writes are real, Anthropic spend is real,
> Firebase users are real, and outbound Gmail sends are real. Don't trigger
> destructive flows (claim send, account changes) unless that's the intent.

**One-time setup**

```bash
gcloud auth login                          # Secret Manager access
gcloud auth application-default login      # ADC for Firebase Admin / Vertex / Pub-Sub
gcloud config set project claimit-beta
```

Verify your account has `roles/secretmanager.secretAccessor` on `claimit-beta`.
Also confirm `localhost` is in the Firebase Console's **Auth → Settings →
Authorized domains** list — without it Google sign-in fails with
`auth/unauthorized-domain`.

**Fastest path: local frontend against the deployed BFF**

```bash
./scripts/fetch_env.sh web                 # writes apps/web/.env.local
pnpm --filter web dev                      # http://localhost:3000
```

This unblocks the Vercel-CD bottleneck for any FE-only change. The deployed
api-gateway already whitelists `http://localhost:3000` in CORS, so no infra
change is needed.

**Full local stack (FE + any subset of backend)**

Fetch envs for whichever services you want to run locally:

```bash
./scripts/fetch_env.sh api-gateway
./scripts/fetch_env.sh assistant-agent
# ...repeat for ingest-agent / monitor-agent / claim-agent / sync-worker
```

Then start the services with the existing `uv run uvicorn` commands. When
running api-gateway locally, point the frontend at it:

```bash
./scripts/fetch_env.sh web --force --local-backend
```

Use `--force` to overwrite an existing `.env.local`.

**Known limitations (v1)**

- **Gmail OAuth from a local api-gateway won't complete.** The OAuth redirect
  URI is registered against the deployed Cloud Run callback. The flow will
  start from localhost but Google redirects back to the prod URL.
- **Pub/Sub push subscriptions can't deliver to localhost.** Handlers under
  `/pubsub/*` won't fire automatically. To exercise them, POST a synthetic
  envelope manually, or tunnel localhost with ngrok and temporarily repoint
  the subscription. `PUBSUB_AUTH_DISABLED=1` is set in the generated
  `.env.local` so manual POSTs aren't rejected by OIDC verification.
- **Backend changes still require running THAT service locally.** The
  deployed BFF only talks to the deployed agents — mixing local FE +
  deployed BFF + local agent doesn't work.

### Linting & formatting

Hooks run automatically on commit. Manual:

```bash
# TypeScript / JSON (Biome)
pnpm exec biome check .
pnpm exec biome check --write .

# Python (Ruff, per agent)
cd apps/ingest-agent && uv run ruff check . && uv run ruff format .
```

## License

Proprietary License
