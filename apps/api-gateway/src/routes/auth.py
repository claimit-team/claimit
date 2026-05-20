"""Auth-related endpoints: GET /auth/me, PATCH /auth/me."""

from __future__ import annotations

from typing import Annotated

from claimit_mongodb_models import (
    DefaultLocation,
    IngestionSkiplistEntry,
    LoyaltyMembership,
    MongoDBClient,
    User,
)
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError
from ..serializers import serialize_user

router = APIRouter(prefix="/auth", tags=["auth"])


class PatchUserMeRequest(BaseModel):
    """Partial-update payload for the authenticated user's profile.

    All fields optional. A null/missing field means "no change". An empty
    list means "clear this list". `email` is intentionally not patchable
    here — it's owned by Firebase Auth and only changes via that flow;
    extra fields in the request body are silently ignored (Pydantic default
    extra='ignore'), so a stray `email` from the frontend is dropped without
    raising 422.
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    default_location: DefaultLocation | None = None
    loyalty_memberships: list[LoyaltyMembership] | None = None
    ingestion_skiplist: list[IngestionSkiplistEntry] | None = None
    onboarded: bool | None = None


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


@router.patch("/me")
async def patch_me(
    body: PatchUserMeRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Partially update the authenticated user's profile.

    Empty/all-null body is a 200 no-op that simply re-serializes the current
    user — saves a wasted Mongo round-trip when the frontend optimistically
    PATCHes "save" with no actual diffs.

    `partial_update(model=User)` validates each top-level field against the
    User schema (raises 422 on shape mismatch) and refuses unknown field
    names. Sub-document fields can't be patched in isolation; the frontend
    must always send the full DefaultLocation / LoyaltyMembership / etc
    object — by design (see routes/settings.py for the same constraint).
    """
    updates = body.model_dump(exclude_none=True, mode="json")
    if not updates:
        return {"user": serialize_user(user)}

    matched = await db.partial_update("users", user.id, updates, model=User)
    if not matched:
        raise ApiError("user_not_found", "User document was removed", status_code=404)

    # Mirror persisted changes onto the in-memory user so the response
    # reflects the post-update state without an extra Mongo read.
    if body.name is not None:
        user.name = body.name
    if body.default_location is not None:
        user.default_location = body.default_location
    if body.loyalty_memberships is not None:
        user.loyalty_memberships = list(body.loyalty_memberships)
    if body.ingestion_skiplist is not None:
        user.ingestion_skiplist = list(body.ingestion_skiplist)
    if body.onboarded is not None:
        user.onboarded = body.onboarded

    return {"user": serialize_user(user)}
