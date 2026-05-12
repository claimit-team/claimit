# ClaimIt

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

Setup instructions will be added as scaffolding tickets complete:
- pnpm workspaces config (ticket 1.3)
- Python project scaffold (ticket 1.4)
- Next.js scaffold (ticket 1.5)

## License

MIT
