"""Help contact form persistence."""

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
    check_email_dedup,
    check_ip_rate_limit,
    get_client_ip,
    is_honeypot_triggered,
    validate_email_or_raise,
)

router = APIRouter(prefix="/help", tags=["help"])
_log = logging.getLogger(__name__)


class ContactSubmissionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., max_length=200)
    subject: str = Field(..., min_length=1, max_length=300)
    message: str = Field(..., min_length=10, max_length=5000)
    website: str | None = Field(None, max_length=500)


class ContactSubmissionResponse(BaseModel):
    id: str
    submitted_at: datetime


def _raise_api_error(code: str, message: str, status_code: int) -> None:
    raise ApiError(code, message, status_code=status_code)


@router.post("/contact", response_model=ContactSubmissionResponse)
async def submit_contact(
    body: ContactSubmissionRequest,
    request: Request,
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> ContactSubmissionResponse:
    now = datetime.now(UTC)

    if is_honeypot_triggered(body.website):
        _log.info("Help contact honeypot triggered from ip=%s", get_client_ip(request))
        return ContactSubmissionResponse(id="rejected", submitted_at=now)

    normalized_email = validate_email_or_raise(body.email, raise_error=_raise_api_error)

    client_ip = get_client_ip(request)
    if not check_ip_rate_limit(client_ip):
        raise ApiError(
            "rate_limited",
            "Please wait a few minutes before sending another message.",
            status_code=429,
        )

    if not await check_email_dedup(db, "help_contact_submissions", normalized_email):
        raise ApiError(
            "rate_limited",
            "You've reached the daily message limit. Please try again tomorrow.",
            status_code=429,
        )

    submission_id = str(uuid.uuid4())
    user_agent = request.headers.get("user-agent", "")

    doc = {
        "submitted_at": now,
        "name": body.name.strip(),
        "email": normalized_email,
        "subject": body.subject.strip(),
        "message": body.message.strip(),
        "user_agent": user_agent[:500] if user_agent else None,
        "source_ip": client_ip[:64] if client_ip else None,
    }

    inserted = await db.try_insert_idempotency_record(
        "help_contact_submissions",
        submission_id,
        doc,
    )
    if not inserted:
        raise ApiError(
            "duplicate_submission",
            "This message was already received.",
            status_code=409,
        )

    return ContactSubmissionResponse(id=submission_id, submitted_at=now)
