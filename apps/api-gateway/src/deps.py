"""Module-global singletons + helpers shared across routes and middleware.

Each `_x` is set during `lifespan()` in main.py and read via `get_x()` from
FastAPI dependencies. The getters raise `RuntimeError` if accessed before
init — a clear failure mode if someone forgets to wire a new resource into
the lifespan.

These globals are intentionally per-process (Cloud Run instance). For pooled
resources (MongoDB connection pool, Secret Manager gRPC channel) that's
correct; for the in-process AccessTokenCache it means each instance warms
its own cache, which is the documented design trade-off for ticket 4.14.
"""

from __future__ import annotations

import uuid

from claimit_mongodb_models import MongoDBClient
from google.cloud import secretmanager

from .services.token_cache import AccessTokenCache

_db: MongoDBClient | None = None
_secret_manager_client: secretmanager.SecretManagerServiceClient | None = None
_state_jwt_key: str | None = None
_token_cache: AccessTokenCache | None = None


async def get_db() -> MongoDBClient:
    if _db is None:
        raise RuntimeError("MongoDB not initialized")
    return _db


def get_secret_manager_client() -> secretmanager.SecretManagerServiceClient:
    if _secret_manager_client is None:
        raise RuntimeError("Secret Manager client not initialized")
    return _secret_manager_client


def get_state_jwt_key() -> str:
    if _state_jwt_key is None:
        raise RuntimeError("STATE_JWT_SECRET not initialized")
    return _state_jwt_key


def get_token_cache() -> AccessTokenCache:
    if _token_cache is None:
        raise RuntimeError("AccessTokenCache not initialized")
    return _token_cache


def derive_user_id(firebase_uid: str) -> uuid.UUID:
    """Derive a deterministic UUIDv5 from a Firebase UID.

    Decision: uuid5(NAMESPACE_URL, f"firebase:{firebase_uid}")
    This avoids adding firebase_uid to the User schema while keeping
    _id stable across logins. Post-hackathon migration ticket: TBD.
    """
    return uuid.uuid5(uuid.NAMESPACE_URL, f"firebase:{firebase_uid}")
