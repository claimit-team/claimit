"""ClaimIt API gateway — BFF layer for frontend REST API.

Implements the 23 REST endpoints defined in Attachment 2 §3:
- All /api/v1/* calls from the Vercel frontend
- Identity Platform ID token verification (firebase-admin)
- Direct MongoDB queries for CRUD
- Agent Engine SDK to invoke ADK agents for AI tasks
- SSE streams for chat + notifications

Ticket 6.0: empty service skeleton + /health.
Ticket 6.1: middleware wiring (auth, errors, CORS, pagination), MongoDB + Firebase init.
Tickets 6.2-6.6: actual endpoint implementations.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from claimit_mongodb_models import MongoDBClient
from claimit_observability import init_phoenix
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import initialize_app as firebase_init_app

from .middleware.errors import ApiError, api_error_handler, unhandled_error_handler
from .routes import router

_log = logging.getLogger(__name__)

_db: MongoDBClient | None = None


async def get_db() -> MongoDBClient:
    if _db is None:
        raise RuntimeError("MongoDB not initialized")
    return _db


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global _db
    init_phoenix("claimit-api-gateway")
    # Firebase Admin — uses default GCP service account in Cloud Run;
    # falls back to GOOGLE_APPLICATION_CREDENTIALS locally
    firebase_init_app()
    # MongoDB
    mongo_url = os.environ["MONGODB_URI"]
    _db = MongoDBClient(mongo_url)
    yield
    await _db.close()


app = FastAPI(
    title="ClaimIt API gateway",
    version="0.1.0",
    lifespan=lifespan,
)

_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

app.include_router(router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + verify_health.sh."""
    return {"status": "ok", "service": "api-gateway"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt API gateway is running"}
