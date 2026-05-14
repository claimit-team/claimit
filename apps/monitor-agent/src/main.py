"""ClaimIt monitor agent — hello-world entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from claimit_observability import init_phoenix
from fastapi import FastAPI


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-monitor-agent")
    yield


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
