"""Response serializers for shared models.

Single source of truth for response-shape transformations that strip
sensitive fields. Used by routes that return User payloads.
"""

from __future__ import annotations

from claimit_mongodb_models import (
    NotificationEvent,
    PriceHistoryReadTolerant,
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


def serialize_purchase_detail(
    purchase: Purchase | PurchaseReadTolerant,
    price_history: list[PriceHistoryReadTolerant],
    claims: list[dict[str, object]],
) -> dict[str, object]:
    """JSON-serialize the enriched `GET /api/v1/purchases/:id` bundle.

    Wire shape (additive vs the prior `{purchase}`-only response so
    existing consumers — confirm/dismiss flow — keep working):

        {
          "purchase":       Purchase JSON (model_dump by_alias),
          "price_history":  list[PriceHistoryReadTolerant JSON],  # ASC by checked_at
          "claims":         list[ClaimListItem-shaped dict],
        }

    `claims` is already a `list[dict]` from `list_claims_for_purchase`
    (the aggregation projects to the same shape as `/claims` rows so the
    frontend can render with the same `ClaimListItem` helpers); pass it
    through verbatim.

    Empty `price_history` and `claims` are returned as `[]` — the
    frontend chart renders a calm "no snapshots yet" empty state rather
    than crashing.
    """
    return {
        "purchase": serialize_purchase(purchase),
        "price_history": [p.model_dump(mode="json", by_alias=True) for p in price_history],
        "claims": claims,
    }
