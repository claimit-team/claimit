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

from .services.evidence_storage import EvidenceReader
from .services.pubsub_publisher import PubSubPublisher
from .services.receipts_storage import ReceiptsUploader
from .services.token_cache import AccessTokenCache

_db: MongoDBClient | None = None
_secret_manager_client: secretmanager.SecretManagerServiceClient | None = None
_state_jwt_key: str | None = None
_token_cache: AccessTokenCache | None = None
_pubsub_publisher: PubSubPublisher | None = None
_receipts_uploader: ReceiptsUploader | None = None
_evidence_reader: EvidenceReader | None = None


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


def init_pubsub_publisher() -> None:
    """Initialize the module-global Pub/Sub publisher. Called from lifespan()."""
    global _pubsub_publisher
    _pubsub_publisher = PubSubPublisher()


def get_pubsub_publisher() -> PubSubPublisher:
    if _pubsub_publisher is None:
        raise RuntimeError("PubSubPublisher not initialized")
    return _pubsub_publisher


def init_receipts_uploader() -> None:
    """Initialize the module-global receipts uploader. Called from lifespan()."""
    global _receipts_uploader
    _receipts_uploader = ReceiptsUploader()


async def get_receipts_uploader() -> ReceiptsUploader:
    if _receipts_uploader is None:
        raise RuntimeError("ReceiptsUploader not initialized")
    return _receipts_uploader


def init_evidence_reader() -> None:
    """Initialize the module-global evidence reader. Called from lifespan().

    Read-only counterpart to the receipts uploader — backs the GET
    /api/v1/claims/:id/evidence proxy (ticket 5.8). Bucket comes from
    EVIDENCE_BUCKET env (resolved in Terraform from
    google_storage_bucket.evidence.name).
    """
    global _evidence_reader
    _evidence_reader = EvidenceReader()


async def get_evidence_reader() -> EvidenceReader:
    if _evidence_reader is None:
        raise RuntimeError("EvidenceReader not initialized")
    return _evidence_reader


def derive_user_id(firebase_uid: str) -> uuid.UUID:
    """Derive a deterministic UUIDv5 from a Firebase UID.

    Decision: uuid5(NAMESPACE_URL, f"firebase:{firebase_uid}")
    This avoids adding firebase_uid to the User schema while keeping
    _id stable across logins. Post-hackathon migration ticket: TBD.
    """
    return uuid.uuid5(uuid.NAMESPACE_URL, f"firebase:{firebase_uid}")
