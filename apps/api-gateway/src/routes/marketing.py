"""Newsletter subscription persistence."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from claimit_mongodb_models import MongoDBClient
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..deps import get_db
from ..middleware.errors import ApiError
from ..utils.form_security import (
    check_ip_rate_limit,
    get_client_ip,
    is_honeypot_triggered,
    normalize_email,
    validate_email_or_raise,
)

router = APIRouter(prefix="/marketing", tags=["marketing"])
_log = logging.getLogger(__name__)


class NewsletterSubscriptionRequest(BaseModel):
    email: str = Field(..., max_length=200)
    website: str | None = Field(None, max_length=500)


class NewsletterSubscriptionResponse(BaseModel):
    email: str
    subscribed_at: datetime


def _raise_api_error(code: str, message: str, status_code: int) -> None:
    raise ApiError(code, message, status_code=status_code)


@router.post("/newsletter", response_model=NewsletterSubscriptionResponse)
async def subscribe_newsletter(
    body: NewsletterSubscriptionRequest,
    request: Request,
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> NewsletterSubscriptionResponse:
    now = datetime.now(UTC)

    if is_honeypot_triggered(body.website):
        _log.info("Newsletter honeypot triggered from ip=%s", get_client_ip(request))
        return NewsletterSubscriptionResponse(
            email=normalize_email(body.email),
            subscribed_at=now,
        )

    normalized_email = validate_email_or_raise(body.email, raise_error=_raise_api_error)

    client_ip = get_client_ip(request)
    if not check_ip_rate_limit(client_ip):
        raise ApiError(
            "rate_limited",
            "Please wait a few minutes before subscribing.",
            status_code=429,
        )

    existing = await db.aggregate(
        "newsletter_subscriptions",
        [{"$match": {"email": normalized_email}}, {"$limit": 1}],
    )
    if existing:
        row = existing[0]
        subscribed_at = row.get("subscribed_at", now)
        if isinstance(subscribed_at, datetime):
            return NewsletterSubscriptionResponse(
                email=normalized_email, subscribed_at=subscribed_at
            )
        return NewsletterSubscriptionResponse(email=normalized_email, subscribed_at=now)

    user_agent = request.headers.get("user-agent", "")
    doc = {
        "subscribed_at": now,
        "email": normalized_email,
        "source_ip": client_ip[:64] if client_ip else None,
        "user_agent": user_agent[:500] if user_agent else None,
    }

    inserted = await db.try_insert_idempotency_record(
        "newsletter_subscriptions",
        str(uuid.uuid4()),
        doc,
    )
    if not inserted:
        retry = await db.aggregate(
            "newsletter_subscriptions",
            [{"$match": {"email": normalized_email}}, {"$limit": 1}],
        )
        if retry:
            subscribed_at = retry[0].get("subscribed_at", now)
            if isinstance(subscribed_at, datetime):
                return NewsletterSubscriptionResponse(
                    email=normalized_email,
                    subscribed_at=subscribed_at,
                )

    return NewsletterSubscriptionResponse(email=normalized_email, subscribed_at=now)
