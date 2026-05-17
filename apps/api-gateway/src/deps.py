"""MongoDB client singleton and user-ID helpers shared across the app."""

from __future__ import annotations

import uuid

from claimit_mongodb_models import MongoDBClient

_db: MongoDBClient | None = None


async def get_db() -> MongoDBClient:
    if _db is None:
        raise RuntimeError("MongoDB not initialized")
    return _db


def derive_user_id(firebase_uid: str) -> uuid.UUID:
    """Derive a deterministic UUIDv5 from a Firebase UID.

    Decision: uuid5(NAMESPACE_URL, f"firebase:{firebase_uid}")
    This avoids adding firebase_uid to the User schema while keeping
    _id stable across logins. Post-hackathon migration ticket: TBD.
    """
    return uuid.uuid5(uuid.NAMESPACE_URL, f"firebase:{firebase_uid}")
