"""ClaimIt monitor agent — FastAPI entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from claimit_mongodb_models import MongoDBClient
from claimit_observability import init_phoenix
from fastapi import FastAPI, Request

from .cron import run_cron


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-monitor-agent")
    app.state.db = MongoDBClient()
    try:
        yield
    finally:
        await app.state.db.close()


app = FastAPI(
    title="ClaimIt monitor agent",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + smoke tests."""
    return {"status": "ok", "agent": "monitor"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt monitor agent is running"}


@app.post("/cron")
async def cron(request: Request) -> dict[str, int]:
    """Cadence-based price-monitoring sweep.

    Invoked by Cloud Scheduler every 15 minutes (see `infra/terraform/scheduler.tf`).
    Always returns 200 with a counter summary — per-purchase errors are counted,
    not raised, to keep one bad adapter from poisoning the whole run.
    """
    return await run_cron(request.app.state.db)
