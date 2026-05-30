"""Firebase ID-token auth dependencies.

Two parallel paths share the same Firebase verification + User upsert logic:

- get_current_user: Bearer-header auth via HTTPBearer. Used by all JSON
  endpoints.
- get_current_user_from_query_token: Query-param token auth. Used only by
  the SSE endpoint (browser EventSource API can't set custom headers, so
  ?token=<firebase_id_token> is the standard workaround).

Both paths verify the same Firebase ID token type via the same
firebase_admin.auth.verify_id_token() call; the only difference is where
the token is read from on the request.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

import firebase_admin.auth
import firebase_admin.exceptions
from claimit_mongodb_models import MongoDBClient, SendMode, SubscriptionTier, User
from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..deps import derive_user_id, get_db
from .errors import ApiError

_bearer = HTTPBearer(auto_error=False)


def _verify_firebase_token(token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims dict.

    Maps the three firebase_admin exception types to ApiError exactly as
    the original Bearer flow did. Shared by both auth dependencies so
    behavior stays identical regardless of where the token came from.
    """
    try:
        return firebase_admin.auth.verify_id_token(token)
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


async def _user_from_decoded_token(decoded: dict, db: MongoDBClient) -> User:
    """Find-or-create the User document for the verified Firebase claims.

    Shared between Bearer and Query-param dependencies. Identical body to
    the original Bearer-only get_current_user implementation: validates
    uid + email claims, derives the deterministic UUIDv5 _id, then loads
    or upserts.
    """
    decoded_uid: str | None = decoded.get("uid")
    if not decoded_uid:
        raise ApiError("unauthorized", "Token missing uid claim", status_code=401) from None

    email: str | None = decoded.get("email")
    if not email:
        raise ApiError("unauthorized", "Token missing email claim", status_code=401) from None

    uid: uuid.UUID = derive_user_id(decoded_uid)
    picture: str | None = decoded.get("picture")
    user = await db.find_one("users", {"_id": uid}, User)
    if user is None:
        now = datetime.now(UTC)
        user = User(
            id=uid,
            email=email,
            name=decoded.get("name", email.split("@")[0]),
            provider_avatar_url=picture,
            custom_avatar_url=None,
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
            onboarded=False,
            created_at=now,
        )
        await db.upsert("users", user.id, user)
    elif picture is not None and picture != user.provider_avatar_url:
        now = datetime.now(UTC)
        await db.partial_update(
            "users",
            user.id,
            {"provider_avatar_url": picture, "updated_at": now},
            model=User,
        )
        user.provider_avatar_url = picture
        user.updated_at = now

    return user


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> User:
    """Bearer-token auth dependency for normal JSON endpoints."""
    if credentials is None:
        raise ApiError("unauthorized", "Missing or invalid Authorization header", status_code=401)
    decoded = _verify_firebase_token(credentials.credentials)
    return await _user_from_decoded_token(decoded, db)


async def get_current_user_from_query_token(
    db: Annotated[MongoDBClient, Depends(get_db)],
    token: Annotated[str | None, Query()] = None,
) -> User:
    """Query-param token auth for SSE endpoints.

    EventSource API can't set custom request headers, so SSE consumers
    pass the Firebase ID token via ?token=<jwt>. Verification path is
    identical to Bearer auth.
    """
    if not token:
        raise ApiError(
            "unauthorized",
            "Missing or invalid token query parameter",
            status_code=401,
        )
    decoded = _verify_firebase_token(token)
    return await _user_from_decoded_token(decoded, db)
