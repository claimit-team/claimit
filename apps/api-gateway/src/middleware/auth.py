"""Firebase ID-token auth dependency."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

import firebase_admin.auth
import firebase_admin.exceptions
from claimit_mongodb_models import MongoDBClient, SendMode, SubscriptionTier, User
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..deps import derive_user_id, get_db
from .errors import ApiError

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> User:
    if credentials is None:
        raise ApiError("unauthorized", "Missing or invalid Authorization header", status_code=401)

    try:
        decoded = firebase_admin.auth.verify_id_token(credentials.credentials)
    except firebase_admin.auth.InvalidIdTokenError as err:
        raise ApiError("unauthorized", "Invalid or expired token", status_code=401) from err
    except firebase_admin.exceptions.UnavailableError as err:
        raise ApiError(
            "service_unavailable",
            "Auth service temporarily unavailable",
            status_code=503,
        ) from err
    except firebase_admin.exceptions.FirebaseError as err:
        raise ApiError("unauthorized", "Token verification failed", status_code=401) from err

    decoded_uid: str | None = decoded.get("uid")
    if not decoded_uid:
        raise ApiError("unauthorized", "Token missing uid claim", status_code=401) from None

    email: str | None = decoded.get("email")
    if not email:
        raise ApiError("unauthorized", "Token missing email claim", status_code=401) from None

    uid: uuid.UUID = derive_user_id(decoded_uid)
    user = await db.find_one("users", {"_id": uid}, User)
    if user is None:
        now = datetime.now(UTC)
        user = User(
            id=uid,
            email=email,
            name=decoded.get("name", email.split("@")[0]),
            updated_at=now,
            default_location={"city": "", "state": "", "lat": 0.0, "lon": 0.0},
            loyalty_memberships=[],
            gmail_integration={
                "connected": False,
                "connected_at": None,
                "connected_email": None,
                "scopes_granted": [],
                "refresh_token_ref": None,
                "watch_history_id": None,
                "watch_expires_at": None,
                "last_processed_message_id": None,
            },
            send_preference={
                "default_mode": SendMode.APPROVAL,
                "auto_send_delay_seconds": 300,
                "changed_at": None,
            },
            ingestion_skiplist=[],
            notification_prefs={"web_push": True, "email": True},
            subscription={
                "tier": SubscriptionTier.TRIAL,
                "trial_ends": None,
                "renewed_at": None,
            },
            created_at=now,
        )
        await db.upsert("users", user.id, user)

    return user
