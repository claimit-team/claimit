"""Response serializers for shared models.

Single source of truth for response-shape transformations that strip
sensitive fields. Used by routes that return User payloads.
"""

from __future__ import annotations

from claimit_mongodb_models import (
    NotificationEvent,
    Purchase,
    PurchaseReadTolerant,
    User,
)


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


def serialize_purchase(purchase: Purchase | PurchaseReadTolerant) -> dict[str, object]:
    """JSON-serialize a Purchase for response.

    Accepts both the strict `Purchase` model (used on the write paths —
    /upload constructs one directly) and the read-tolerant variant
    `PurchaseReadTolerant` (returned by `db.get_purchase` / `find_many`
    so legacy/degraded docs don't 500 the read endpoints). The wire
    shape is identical because the field set is identical and StrEnum
    values serialise as plain strings either way.

    No fields are stripped today; the helper exists for symmetry with
    serialize_user/serialize_notification and to centralize any future
    exclusion rules (e.g. internal scoring fields).
    """
    return purchase.model_dump(mode="json", by_alias=True)


def serialize_notification(notification: NotificationEvent) -> dict[str, object]:
    """JSON-serialize a NotificationEvent for response.

    No fields are stripped today; the helper exists for symmetry with
    serialize_user and to centralize any future exclusion rules.
    """
    return notification.model_dump(mode="json", by_alias=True)
