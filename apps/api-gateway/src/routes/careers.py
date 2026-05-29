"""Public careers interest-form endpoint (BUG-71 / BUG-77).

First unauthenticated write in the api-gateway. Protected by honeypot,
MIME/size validation, per-IP rate limiting, and per-email daily dedup.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from claimit_mongodb_models import MongoDBClient
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel

from ..deps import get_careers_resumes_uploader, get_db
from ..middleware.errors import ApiError
from ..services.careers_resumes import (
    ALLOWED_RESUME_CONTENT_TYPES,
    MAX_RESUME_BYTES,
    CareersResumesUploader,
    sanitize_filename,
)
from ..utils.form_security import (
    check_email_dedup,
    check_ip_rate_limit,
    get_client_ip,
    is_honeypot_triggered,
    validate_email_or_raise,
)

router = APIRouter(prefix="/careers", tags=["careers"])
_log = logging.getLogger(__name__)

_MAX_EMAIL_SUBMISSIONS_PER_DAY = 3
_READ_CHUNK_BYTES = 64 * 1024


class InterestSubmissionResponse(BaseModel):
    id: str
    submitted_at: datetime


def _raise_api_error(code: str, message: str, status_code: int) -> None:
    raise ApiError(code, message, status_code=status_code)


async def _read_limited_resume(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_READ_CHUNK_BYTES):
        total += len(chunk)
        if total > MAX_RESUME_BYTES:
            raise ApiError(
                "file_too_large",
                "Resume must be 5MB or smaller.",
                status_code=400,
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/interest", response_model=InterestSubmissionResponse)
async def submit_interest(
    request: Request,
    db: Annotated[MongoDBClient, Depends(get_db)],
    uploader: Annotated[CareersResumesUploader, Depends(get_careers_resumes_uploader)],
    name: Annotated[str, Form(min_length=1, max_length=200)],
    email: Annotated[str, Form(min_length=3, max_length=320)],
    resume: Annotated[UploadFile, File(description="Resume (PDF, DOC, or DOCX, ≤5 MB).")],
    role_slug: Annotated[str | None, Form()] = None,
    role_title: Annotated[str | None, Form()] = None,
    message: Annotated[str | None, Form(max_length=2000)] = None,
    linkedin_url: Annotated[str | None, Form(max_length=500)] = None,
    github_url: Annotated[str | None, Form(max_length=500)] = None,
    website: Annotated[str | None, Form()] = None,
) -> InterestSubmissionResponse:
    """Accept a careers interest submission with resume upload."""
    now = datetime.now(UTC)

    if is_honeypot_triggered(website):
        _log.info("Careers interest honeypot triggered from ip=%s", get_client_ip(request))
        return InterestSubmissionResponse(id="rejected", submitted_at=now)

    client_ip = get_client_ip(request)
    if not check_ip_rate_limit(client_ip):
        raise ApiError(
            "rate_limited",
            "Please wait a few minutes before submitting again.",
            status_code=429,
        )

    content_type = resume.content_type or "application/octet-stream"
    if content_type not in ALLOWED_RESUME_CONTENT_TYPES:
        raise ApiError(
            "unsupported_media_type",
            "Resume must be a PDF, DOC, or DOCX file.",
            status_code=400,
        )

    contents = await _read_limited_resume(resume)
    if not contents:
        raise ApiError("validation_error", "Resume file is required.", status_code=400)

    normalized_email = validate_email_or_raise(email, raise_error=_raise_api_error)

    if not await check_email_dedup(
        db,
        "careers_interest_submissions",
        normalized_email,
        max_per_day=_MAX_EMAIL_SUBMISSIONS_PER_DAY,
    ):
        raise ApiError(
            "rate_limited",
            "You've reached the daily submission limit. Please contact us directly.",
            status_code=429,
        )

    submission_id = str(uuid.uuid4())
    sanitized_filename = sanitize_filename(resume.filename or "resume.pdf")
    storage_path = await uploader.upload(
        submission_id=submission_id,
        filename=sanitized_filename,
        content=contents,
        content_type=content_type,
    )

    user_agent = request.headers.get("user-agent", "")
    doc = {
        "submitted_at": now,
        "name": name.strip(),
        "email": normalized_email,
        "role_slug": role_slug.strip() if role_slug else None,
        "role_title": role_title.strip() if role_title else None,
        "message": message.strip() if message else None,
        "linkedin_url": linkedin_url.strip() if linkedin_url else None,
        "github_url": github_url.strip() if github_url else None,
        "resume_storage_path": storage_path,
        "resume_filename": sanitized_filename,
        "resume_content_type": content_type,
        "resume_size_bytes": len(contents),
        "user_agent": user_agent[:500] if user_agent else None,
        "source_ip": client_ip[:64] if client_ip else None,
    }

    inserted = await db.try_insert_idempotency_record(
        "careers_interest_submissions",
        submission_id,
        doc,
    )
    if not inserted:
        raise ApiError(
            "duplicate_submission",
            "This submission was already received.",
            status_code=409,
        )

    return InterestSubmissionResponse(id=submission_id, submitted_at=now)
