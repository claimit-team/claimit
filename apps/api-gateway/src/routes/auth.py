"""Auth-related endpoints: /auth/me."""

from __future__ import annotations

from typing import Annotated

from claimit_mongodb_models import User
from fastapi import APIRouter, Depends

from ..middleware.auth import get_current_user
from ..serializers import serialize_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_me(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    """Return the authenticated user with sensitive fields stripped.

    Strips gmail_integration.refresh_token_ref (Secret Manager reference to
    the OAuth refresh token). All other fields belong to the authenticated
    user themselves and are safe to surface to the frontend.
    """
    return {"user": serialize_user(user)}
