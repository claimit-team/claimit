# ClaimIt

[![CI](https://github.com/claimit-team/claimit/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/claimit-team/claimit/actions/workflows/ci.yml)

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

- Node 20+ via [volta](https://volta.sh) (recommended) or nvm
- Python 3.12 via [uv](https://docs.astral.sh/uv/)
- [pnpm](https://pnpm.io) 9+ (managed by volta or corepack)
- [pre-commit](https://pre-commit.com) (`uv tool install pre-commit` — uses uv which is already required for Python agents)

### First-time setup

```bash
# Clone
git clone https://github.com/claimit-team/claimit
cd claimit

# Install Node tooling
pnpm install

# Install Python tooling (per agent)
cd apps/ingest-agent && uv sync && cd ../..
cd apps/monitor-agent && uv sync && cd ../..
cd apps/claim-agent && uv sync && cd ../..
cd apps/assistant-agent && uv sync && cd ../..

# Install pre-commit (managed by uv to avoid brew Python conflicts)
uv tool install pre-commit

# Install git hooks
pre-commit install
```

### Running services locally

```bash
# Frontend (port 3000)
pnpm --filter web dev

# Backend agents (one per terminal)
cd apps/ingest-agent && uv run uvicorn src.main:app --reload --port 8001
cd apps/monitor-agent && uv run uvicorn src.main:app --reload --port 8002
cd apps/claim-agent && uv run uvicorn src.main:app --reload --port 8003
cd apps/assistant-agent && uv run uvicorn src.main:app --reload --port 8004
```

### Linting & formatting

```bash
# All TS/JSON via Biome
pnpm exec biome check .
pnpm exec biome check --write .

# Python (per agent)
cd apps/ingest-agent && uv run ruff check . && uv run ruff format .
```

These also run automatically on every commit via pre-commit hooks.

## License

MIT
