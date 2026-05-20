"""Purchases endpoints (Attachment 2 §3.3).

GET    /api/v1/purchases             list with filters + cursor pagination
GET    /api/v1/purchases/{id}        single purchase (scoped to user)
POST   /api/v1/purchases/{id}/confirm  apply optional corrections, → monitoring
POST   /api/v1/purchases/{id}/dismiss  → dismissed, optionally update skiplist
POST   /api/v1/purchases/upload      multipart receipt → pending_confirmation doc

All routes are scoped to `user.id` from get_current_user — users cannot
read or mutate another user's purchases (404, never 403, to avoid
leaking existence).
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from claimit_mongodb_models import Category, MongoDBClient, PurchaseStatus, User
from fastapi import APIRouter, Depends, File, Path, Query, UploadFile
from pydantic import BaseModel, Field

from ..deps import get_db, get_receipts_uploader
from ..middleware.auth import get_current_user
from ..serializers import serialize_purchase
from ..services import purchases as purchases_service
from ..services.purchases import DismissReason
from ..services.receipts_storage import ReceiptsUploader

router = APIRouter(prefix="/purchases", tags=["purchases"])
_UPLOAD_READ_CHUNK_BYTES = 64 * 1024


class ConfirmPurchaseRequest(BaseModel):
    corrected_fields: dict[str, Any] | None = Field(default=None)


class DismissPurchaseRequest(BaseModel):
    reason: DismissReason
    remember_sender: bool = Field(default=False)
    # Backward-compat shim for the still-OPEN frontend issue #103. Once
    # Purchase carries the original email sender, this field will be
    # dropped and the service will read sender from purchase.
    sender: str | None = Field(default=None, min_length=1)


@router.get("")
async def list_purchases(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    status: Annotated[PurchaseStatus | None, Query()] = None,
    category: Annotated[Category | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query()] = None,
) -> dict[str, object]:
    """Paginated list scoped to the authenticated user."""
    return await purchases_service.list_purchases(
        db=db,
        user_id=user.id,
        status=status,
        category=category,
        limit=limit,
        cursor=cursor,
    )


# Upload route must be declared before `/{purchase_id}` so FastAPI does
# not try to interpret "upload" as a UUID path parameter and 422 the
# request — same pattern as notifications.py ack-all.
@router.post("/upload")
async def upload_purchase_receipt(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    uploader: Annotated[ReceiptsUploader, Depends(get_receipts_uploader)],
    file: Annotated[UploadFile, File(description="Receipt file (PDF/PNG/JPEG, ≤10 MB).")],
) -> dict[str, object]:
    """Persist a manually-uploaded receipt and create a pending Purchase doc."""
    content_type = file.content_type or "application/octet-stream"
    purchases_service.validate_upload_content_type(content_type)
    file_bytes = await _read_limited_upload(file)
    purchase = await purchases_service.upload_receipt(
        db=db,
        uploader=uploader,
        user=user,
        file_bytes=file_bytes,
        content_type=content_type,
        filename=file.filename,
    )
    return {"purchase": serialize_purchase(purchase)}


async def _read_limited_upload(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_UPLOAD_READ_CHUNK_BYTES):
        total += len(chunk)
        purchases_service.validate_upload_size(total)
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/{purchase_id}")
async def get_purchase(
    purchase_id: Annotated[str, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    uid: UUID = purchases_service.parse_purchase_id(purchase_id)
    purchase = await purchases_service.get_purchase_for_user(db, user.id, uid)
    return {"purchase": serialize_purchase(purchase)}


@router.post("/{purchase_id}/confirm")
async def confirm_purchase(
    purchase_id: Annotated[str, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    body: ConfirmPurchaseRequest | None = None,
) -> dict[str, object]:
    """Confirm a low-confidence extraction and start monitoring."""
    uid = purchases_service.parse_purchase_id(purchase_id)
    corrected = body.corrected_fields if body else None
    purchase = await purchases_service.confirm_purchase(
        db=db,
        user=user,
        purchase_id=uid,
        corrected_fields=corrected,
    )
    return {"purchase": serialize_purchase(purchase)}


@router.post("/{purchase_id}/dismiss")
async def dismiss_purchase(
    purchase_id: Annotated[str, Path()],
    body: DismissPurchaseRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Dismiss a pending purchase (not_an_order, duplicate, or other)."""
    uid = purchases_service.parse_purchase_id(purchase_id)
    return await purchases_service.dismiss_purchase(
        db=db,
        user=user,
        purchase_id=uid,
        reason=body.reason,
        remember_sender=body.remember_sender,
        sender=body.sender,
    )
