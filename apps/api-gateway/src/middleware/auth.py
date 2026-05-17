"""Firebase ID-token auth dependency."""

from __future__ import annotations

from typing import Annotated

import firebase_admin.auth
from claimit_mongodb_models import MongoDBClient, User
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..main import get_db
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
    except (firebase_admin.auth.InvalidIdTokenError, firebase_admin.auth.ExpiredIdTokenError):
        raise ApiError("unauthorized", "Invalid or expired token", status_code=401) from None

    email: str | None = decoded.get("email")
    if not email:
        raise ApiError("unauthorized", "Token missing email claim", status_code=401)
    # TODO: add firebase_uid field to User model for more robust lookup (ticket TBD)
    user = await db.find_one("users", {"email": email}, User)
    if user is None:
        raise ApiError("unauthorized", "User not found", status_code=401)

    return user
