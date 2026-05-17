"""ClaimIt API gateway — BFF layer for frontend REST API.

Implements the 23 REST endpoints defined in Attachment 2 §3:
- All /api/v1/* calls from the Vercel frontend
- Identity Platform ID token verification (firebase-admin)
- Direct MongoDB queries for CRUD
- Agent Engine SDK to invoke ADK agents for AI tasks
- SSE streams for chat + notifications

Ticket 6.0 (this commit): empty service skeleton + /health.
Tickets 6.1-6.6: actual endpoint implementations.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from claimit_observability import init_phoenix
from fastapi import FastAPI

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-api-gateway")
    yield


app = FastAPI(
    title="ClaimIt API gateway",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + verify_health.sh."""
    return {"status": "ok", "service": "api-gateway"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt API gateway is running"}
