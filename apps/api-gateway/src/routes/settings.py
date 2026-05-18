"""User settings endpoints: PUT /settings/send-preference, /settings/notifications.

These are PUT (not PATCH) endpoints: each request body fully replaces the
corresponding sub-document on User (User.send_preference or
User.notification_prefs). Partial updates of individual sub-fields are not
supported — `MongoDBClient.partial_update` validates each top-level field
against the User schema and the only way to mutate a nested field is to
re-send the entire sub-document.

`changed_at` on SendPreference is server-set (datetime.now(UTC)) — the
frontend never controls it. NotificationPrefs has no audit timestamp.

Response envelope mirrors GET /auth/me: `{"user": <User with
gmail_integration.refresh_token_ref stripped>}`. Returning the canonical
user post-update lets the frontend swap its Zustand cache in one round-trip.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from claimit_mongodb_models import MongoDBClient, NotificationEventType, SendMode, User
from claimit_mongodb_models.user import NotificationPrefs, SendPreference
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError

router = APIRouter(prefix="/settings", tags=["settings"])


# Tight upper bound on auto-send delay. 24h gives the user a full day to
# notice an autonomous draft before it ships. Anything longer is almost
# certainly a unit-confusion bug on the frontend (milliseconds vs seconds).
_MAX_AUTO_SEND_DELAY_SECONDS: int = 86_400


class UpdateSendPreferenceRequest(BaseModel):
    default_mode: SendMode
    auto_send_delay_seconds: int = Field(ge=0, le=_MAX_AUTO_SEND_DELAY_SECONDS)


class UpdateNotificationsRequest(BaseModel):
    web_push: bool
    email: bool
    muted_event_types: list[NotificationEventType]


def _serialize_user(user: User) -> dict[str, object]:
    """Mirror /auth/me's stripping rules so frontends can swap Zustand state."""
    payload = user.model_dump(
        mode="json",
        by_alias=True,
        exclude={"gmail_integration": {"refresh_token_ref"}},
    )
    return {"user": payload}


@router.put("/send-preference")
async def update_send_preference(
    body: UpdateSendPreferenceRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Replace `User.send_preference` with the supplied (default_mode,
    auto_send_delay_seconds). `changed_at` is stamped server-side."""
    new_prefs = SendPreference(
        default_mode=body.default_mode,
        auto_send_delay_seconds=body.auto_send_delay_seconds,
        changed_at=datetime.now(UTC),
    )
    matched = await db.partial_update(
        "users",
        user.id,
        {"send_preference": new_prefs.model_dump()},
        model=User,
    )
    if not matched:
        raise ApiError("user_not_found", "User document was removed", status_code=404)

    user.send_preference = new_prefs
    return _serialize_user(user)


@router.put("/notifications")
async def update_notifications(
    body: UpdateNotificationsRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Replace `User.notification_prefs` with the supplied (web_push, email,
    muted_event_types)."""
    new_prefs = NotificationPrefs(
        web_push=body.web_push,
        email=body.email,
        muted_event_types=list(body.muted_event_types),
    )
    matched = await db.partial_update(
        "users",
        user.id,
        {"notification_prefs": new_prefs.model_dump()},
        model=User,
    )
    if not matched:
        raise ApiError("user_not_found", "User document was removed", status_code=404)

    user.notification_prefs = new_prefs
    return _serialize_user(user)
