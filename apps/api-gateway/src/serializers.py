"""Response serializers for shared models.

Single source of truth for response-shape transformations that strip
sensitive fields. Used by routes that return User payloads.
"""

from __future__ import annotations

from claimit_mongodb_models import User


def serialize_user(user: User) -> dict[str, object]:
    """JSON-serialize a User for response, stripping sensitive fields.

    Currently strips gmail_integration.refresh_token_ref. Any future
    sensitive field on User should be added here, not duplicated in each
    route handler.

    Used by /auth/me and /settings/*.
    """
    return user.model_dump(
        mode="json",
        by_alias=True,
        exclude={"gmail_integration": {"refresh_token_ref"}},
    )
