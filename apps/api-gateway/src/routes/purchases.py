"""Purchases endpoints (Attachment 2 §3.3).

GET    /api/v1/purchases                 list with filters + cursor pagination
GET    /api/v1/purchases/{id}            single purchase (scoped to user)
GET    /api/v1/purchases/{id}/receipt    receipt-blob proxy (ticket 5.14)
POST   /api/v1/purchases/{id}/confirm    apply optional corrections, → monitoring
POST   /api/v1/purchases/{id}/dismiss    → dismissed, optionally update skiplist
POST   /api/v1/purchases/upload          multipart receipt → pending_confirmation doc

All routes are scoped to `user.id` from get_current_user — users cannot
read or mutate another user's purchases (404, never 403, to avoid
leaking existence).
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from claimit_mongodb_models import Category, MongoDBClient, PurchaseStatus, User
from fastapi import APIRouter, Depends, File, Path, Query, Response, UploadFile
from pydantic import BaseModel, Field

from ..deps import get_db, get_pubsub_publisher, get_receipts_uploader
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError
from ..serializers import serialize_purchase, serialize_purchase_detail
from ..services import claims_service
from ..services import purchases as purchases_service
from ..services.pubsub_publisher import PubSubPublisher
from ..services.purchases import DismissReason
from ..services.receipts_storage import ReceiptsUploader

router = APIRouter(prefix="/purchases", tags=["purchases"])
_UPLOAD_READ_CHUNK_BYTES = 64 * 1024


class ConfirmPurchaseRequest(BaseModel):
    corrected_fields: dict[str, Any] | None = Field(default=None)


class CreatePurchaseRequest(BaseModel):
    """Body for POST /purchases/confirm-create (write-after-confirm upload).

    Carries the upload-time `storage_url` / `content_type` plus the
    `extraction` the FE received from /upload and any user `corrected_fields`.
    The Purchase is created here on confirm — nothing was persisted at upload
    time. `extraction` is null when the extractor failed and the user filled
    the form by hand. The receipt hash is recomputed server-side from the GCS
    object (never trusted from the client), so it isn't part of this body.
    """

    storage_url: str = Field(min_length=1)
    content_type: str = Field(min_length=1)
    extraction: dict[str, Any] | None = Field(default=None)
    corrected_fields: dict[str, Any] | None = Field(default=None)
    # Which line of a multi-item receipt this confirm tracks ("line-0",
    # "line-1", …). None for single-item uploads and manual fill. Lets the
    # user create one monitored Purchase per item off a single receipt —
    # the server scopes dedup on it and suffixes the internal receipt_hash
    # so the lines don't collide on the shared order_id / receipt bytes.
    receipt_line_key: str | None = Field(default=None)


class ReuploadReceiptRequest(BaseModel):
    """Body for POST /purchases/{id}/reupload-receipt (BUG-85).

    Carries the upload-time `storage_url` / `content_type` plus the
    `extraction` the FE received from /upload and any user `corrected_fields`
    from the review form. Same shape as CreatePurchaseRequest — the
    difference is the target: this updates an EXISTING monitored purchase in
    place rather than creating a new one. The receipt hash is recomputed
    server-side from the GCS object (never trusted from the client).
    """

    storage_url: str = Field(min_length=1)
    content_type: str = Field(min_length=1)
    extraction: dict[str, Any] | None = Field(default=None)
    corrected_fields: dict[str, Any] | None = Field(default=None)


class UpdatePurchaseRequest(BaseModel):
    """Body for PATCH /purchases/{id}.

    Narrow on purpose — this endpoint is the remediation lane for BUG-19
    (a monitoring purchase missing `product_url` will never get a price
    snapshot). General edits still go through /confirm before monitoring
    starts.

    `product_url` is REQUIRED (`Field(...)`), not defaulted to `None`. The
    service writes the value through unconditionally, so a defaulted field
    plus an omitted key in the request body would silently wipe an
    existing URL on the doc. With required semantics a missing key 422s
    at Pydantic validation; an explicit `null` is still accepted to allow
    intentional clearing.
    """

    product_url: str | None = Field(...)


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
    status: Annotated[list[PurchaseStatus] | None, Query()] = None,
    category: Annotated[Category | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query()] = None,
) -> dict[str, object]:
    """Paginated list scoped to the authenticated user.

    Filters:
    - `status`: zero-or-more `PurchaseStatus` enum values. Accepts
      repeated query keys (`?status=monitoring&status=monitoring_degraded`).
      Backward compatible — a single `?status=x` becomes a 1-element
      list that the service translates to `$in: [x]`, semantically
      equivalent to the previous equality match. Repeating the param
      lets the dashboard's "Monitored purchases" hook surface both
      `monitoring` AND `monitoring_degraded` rows so the section's
      row count matches the dashboard-summary `monitoring_purchases_count`.
    - `category`: exact enum match (existing).
    - `q`: case-insensitive substring search across `platform`,
      `product_name`, and `order_id`. `re.escape`d server-side, capped at
      `Q_MAX_LENGTH` characters. Combines with status/category via AND.

    The `q` length guard mirrors the claims-list contract: same hard
    cap (`Q_MAX_LENGTH = 100`) so runaway-input regex compile cost
    stays bounded the same way across endpoints.
    """
    if q is not None:
        q = q.strip()
        if len(q) > claims_service.Q_MAX_LENGTH:
            raise ApiError(
                "invalid_search_query",
                f"Search query must be at most {claims_service.Q_MAX_LENGTH} characters",
                status_code=400,
            )
        if not q:
            q = None
    return await purchases_service.list_purchases(
        db=db,
        user_id=user.id,
        status=status,
        category=category,
        q=q,
        limit=limit,
        cursor=cursor,
    )


# Upload + confirm-create routes must be declared before `/{purchase_id}`
# so FastAPI does not try to interpret "upload"/"confirm-create" as a UUID
# path parameter and 422 the request — same pattern as notifications.py
# ack-all.
@router.post("/upload")
async def upload_purchase_receipt(
    user: Annotated[User, Depends(get_current_user)],
    uploader: Annotated[ReceiptsUploader, Depends(get_receipts_uploader)],
    file: Annotated[UploadFile, File(description="Receipt file (PDF/PNG/JPEG, ≤10 MB).")],
) -> dict[str, object]:
    """Store a receipt in GCS + extract its fields — NO Mongo write.

    Write-after-confirm: returns the extracted fields straight to the
    browser. The Purchase is created only when the user confirms via
    POST /purchases/confirm-create. Response shape:
    `{storage_url, content_type, receipt_hash, extraction}` where
    `extraction` is null if the receipt could not be read (manual fill).
    """
    content_type = file.content_type or "application/octet-stream"
    purchases_service.validate_upload_content_type(content_type)
    file_bytes = await _read_limited_upload(file)
    return await purchases_service.upload_receipt(
        uploader=uploader,
        user=user,
        file_bytes=file_bytes,
        content_type=content_type,
        filename=file.filename,
    )


@router.post("/confirm-create")
async def confirm_create_purchase(
    body: CreatePurchaseRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    uploader: Annotated[ReceiptsUploader, Depends(get_receipts_uploader)],
    publisher: Annotated[PubSubPublisher, Depends(get_pubsub_publisher)],
) -> dict[str, object]:
    """Create the Purchase for a confirmed upload (the first Mongo write).

    Dedups against already-committed purchases (409 on a true duplicate),
    transitions to monitoring, and publishes `purchase.ingested`.
    """
    purchase = await purchases_service.create_purchase_from_confirm(
        db=db,
        uploader=uploader,
        publisher=publisher,
        user=user,
        storage_url=body.storage_url,
        content_type=body.content_type,
        extraction=body.extraction,
        corrected_fields=body.corrected_fields,
        receipt_line_key=body.receipt_line_key,
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


# The receipt route must precede the catch-all `/{purchase_id}` GET so
# FastAPI's path-matching picks it up first — same pattern as the
# `/upload` route above. Without this ordering, `:id/receipt` would be
# parsed as `purchase_id == "{id}/receipt"` and 422 at the UUID coerce.
@router.get("/{purchase_id}/receipt")
async def get_purchase_receipt(
    purchase_id: Annotated[str, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    uploader: Annotated[ReceiptsUploader, Depends(get_receipts_uploader)],
) -> Response:
    """Stream a user's receipt blob from GCS through api-gateway.

    Proxy (NOT a signed URL): the receipts bucket has
    `public_access_prevention=enforced` per terraform/storage.tf so we
    never mint signBlob credentials. api-gateway already holds
    `roles/storage.objectViewer` on the bucket; we proxy the bytes back
    to the authenticated browser with the original content-type.

    404 covers every failure mode (missing purchase, non-owner, no
    `receipt_storage_url`, malformed gs:// URI, blob missing in GCS,
    bucket mismatch) — see `services.purchases.fetch_receipt_for_user`
    for the matrix. We never 403 / never leak existence across users.

    Receipts are bounded at MAX_UPLOAD_BYTES (10 MB) by the upload
    validator, so a plain `Response(content=bytes)` is sufficient — no
    streaming required.
    """
    uid: UUID = purchases_service.parse_purchase_id(purchase_id)
    data, content_type = await purchases_service.fetch_receipt_for_user(
        db=db,
        uploader=uploader,
        user_id=user.id,
        purchase_id=uid,
    )
    return Response(content=data, media_type=content_type)


@router.get("/{purchase_id}")
async def get_purchase(
    purchase_id: Annotated[str, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Return the enriched purchase-detail bundle (ticket 5.6).

    Response shape (additive vs the prior `{purchase}`-only body; existing
    consumers — confirm/dismiss flow — keep working):

        {
          "purchase":       Purchase JSON,
          "price_history":  list of PriceHistoryReadTolerant JSON, ASC by checked_at,
          "claims":         list of ClaimListItem-shaped dicts for this purchase.
        }

    All three reads run through the tolerant variants so a single
    legacy/rogue row in any collection cannot 500 the page.
    """
    uid: UUID = purchases_service.parse_purchase_id(purchase_id)
    purchase, price_history, claims = await purchases_service.get_purchase_detail(
        db=db, user_id=user.id, purchase_id=uid
    )
    return serialize_purchase_detail(purchase, price_history, claims)


@router.patch("/{purchase_id}")
async def update_purchase(
    purchase_id: Annotated[str, Path()],
    body: UpdatePurchaseRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Set `product_url` on a confirmed purchase (BUG-19 remediation).

    Narrow on purpose — only `product_url` is editable. The endpoint also
    clears `last_monitor_error*` so the UI returns to the waiting state
    without having to wait for the next monitor cron tick to recover.
    """
    uid = purchases_service.parse_purchase_id(purchase_id)
    purchase = await purchases_service.update_purchase_product_url(
        db=db,
        user=user,
        purchase_id=uid,
        product_url=body.product_url,
    )
    return {"purchase": serialize_purchase(purchase)}


@router.post("/{purchase_id}/confirm")
async def confirm_purchase(
    purchase_id: Annotated[str, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    publisher: Annotated[PubSubPublisher, Depends(get_pubsub_publisher)],
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
        publisher=publisher,
    )
    return {"purchase": serialize_purchase(purchase)}


@router.post("/{purchase_id}/stop-monitoring")
async def stop_monitoring(
    purchase_id: Annotated[str, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Stop tracking a monitored purchase → dismissed (BUG-85).

    Dedicated endpoint (NOT /dismiss): only valid from `monitoring` /
    `monitoring_degraded`; 409 otherwise. The frontend renders the
    resulting `dismissed` status as a neutral "Stopped" badge.
    """
    uid = purchases_service.parse_purchase_id(purchase_id)
    purchase = await purchases_service.stop_monitoring(
        db=db,
        user=user,
        purchase_id=uid,
    )
    return {"purchase": serialize_purchase(purchase)}


@router.post("/{purchase_id}/reupload-receipt")
async def reupload_receipt(
    purchase_id: Annotated[str, Path()],
    body: ReuploadReceiptRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    uploader: Annotated[ReceiptsUploader, Depends(get_receipts_uploader)],
) -> dict[str, object]:
    """Replace the receipt on a monitored purchase and apply its fields (BUG-85).

    The receipt blob was already stored (+ extracted) by POST /upload; this
    swaps it onto the existing purchase, applies the reviewed fields,
    recomputes the window, clears stale monitor errors, and keeps monitoring.
    Only valid from `monitoring` / `monitoring_degraded` (409 otherwise).
    """
    uid = purchases_service.parse_purchase_id(purchase_id)
    purchase = await purchases_service.reupload_receipt(
        db=db,
        uploader=uploader,
        user=user,
        purchase_id=uid,
        storage_url=body.storage_url,
        content_type=body.content_type,
        extraction=body.extraction,
        corrected_fields=body.corrected_fields,
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
