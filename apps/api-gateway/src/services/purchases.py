"""Purchases service: list/detail/confirm/dismiss/upload business logic.

See Attachment 2 §3.3 for the endpoint contract. Routes in
`routes/purchases.py` are thin wrappers that adapt request/response
shapes; all DB and storage work lives here.
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from claimit_mongodb_models import (
    SKIPLIST_MAX_ENTRIES,
    Category,
    ClaimType,
    ExtractionConfidence,
    IngestionSkiplistEntry,
    IngestionSource,
    MongoDBClient,
    Platform,
    PriceHistoryReadTolerant,
    Purchase,
    PurchaseDateBasis,
    PurchaseReadTolerant,
    PurchaseStatus,
    User,
    compute_window_days,
    normalize_sender,
)
from claimit_pubsub import TOPIC_PURCHASE_UPLOADED, PurchaseUploadedEvent
from pydantic import ValidationError

from ..middleware.errors import ApiError
from ..middleware.pagination import apply_cursor_to_query, encode_cursor
from ..services import claims_service
from ..services.pubsub_publisher import PubSubPublisher
from ..services.receipts_storage import ReceiptObjectMissingError, ReceiptsUploader

_log = logging.getLogger(__name__)

DismissReason = Literal["not_an_order", "duplicate", "other"]

# Fields a user may correct via POST /confirm. System-managed fields
# (identity, status, extraction metadata, infra-derived dates) are
# disallowed — any attempt to set them returns 400.
_ALLOWED_CORRECTABLE_FIELDS: frozenset[str] = frozenset(
    {
        "platform",
        "category",
        "product_name",
        "product_id",
        "product_url",
        "variant",
        "fare_class",
        "room_type",
        "bed_type",
        "rate_type",
        "price_paid",
        "member_price_at_purchase",
        "non_member_price_at_purchase",
        "purchase_date",
        "purchase_date_basis",
        "order_id",
        "member_tier_at_purchase",
        "monitoring_cadence_minutes",
    }
)

_ALLOWED_UPLOAD_CONTENT_TYPES: dict[str, IngestionSource] = {
    "application/pdf": IngestionSource.UPLOAD_PDF,
    "image/png": IngestionSource.UPLOAD_IMAGE,
    "image/jpeg": IngestionSource.UPLOAD_IMAGE,
}

# 10 MB per Attachment 2 §3.3 + acceptance criteria.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Pending-confirmation upload defaults. The ingest agent overwrites every
# one of these once it picks up the upload (via change stream or future
# Pub/Sub). Frontend must not display these literal values — it should
# render the upload as "Processing…" while status == pending_confirmation.
_UPLOAD_PURCHASE_DEFAULTS: dict[str, Any] = {
    "platform": Platform.AMAZON,
    "category": Category.RETAIL,
    "product_name": "",
    "product_id": "",
    "product_url": None,
    "variant": None,
    "fare_class": None,
    "room_type": None,
    "bed_type": None,
    "rate_type": None,
    # price_paid has gt=0; use 0.01 sentinel until extraction fills it in.
    "price_paid": 0.01,
    "member_price_at_purchase": None,
    "non_member_price_at_purchase": None,
    "currency": "USD",
    "purchase_date_basis": PurchaseDateBasis.ORDER_DATE,
    "order_id": "",
    "member_tier_at_purchase": None,
    "claim_type": ClaimType.SELF_SERVICE,
    "monitoring_cadence_minutes": 360,
}


def parse_purchase_id(purchase_id: str) -> UUID:
    try:
        return UUID(purchase_id)
    except ValueError as err:
        raise ApiError("invalid_purchase_id", "Invalid purchase id", status_code=400) from err


async def list_purchases(
    db: MongoDBClient,
    user_id: UUID,
    status: list[PurchaseStatus] | None,
    category: Category | None,
    limit: int,
    cursor: str | None,
    q: str | None = None,
) -> dict[str, object]:
    """Paginated list of the authenticated user's purchases.

    Pagination is `_id` ASC via the shared `apply_cursor_to_query` helper.
    `total_count` reflects the full filtered set, not just the current page.

    Search semantics (mirrors claims-list `q` precedent, simpler path
    because purchases needs no `$lookup`):
    - `q` is `re.escape`d before regex construction. User input cannot
      inject regex metacharacters or trigger ReDoS — a stray "(" or "*"
      becomes a literal substring match.
    - `q` matches case-insensitively against `platform` OR
      `product_name` OR `order_id`. Documents where any of these is
      null/missing simply don't match (desired).
    - Cursor + `q` coexist as top-level keys (Mongo ANDs them). The
      cursor key is `_id`; `q` adds `$or` — separate top-level keys, no
      conflict, no `$and` wrapping needed.
    - Empty / whitespace-only `q` should be normalised to None by the
      route before reaching the service. Defensive strip-and-skip
      here anyway so unit tests calling the service directly behave
      the same as the HTTP entry point.
    """
    base_filter: dict[str, Any] = {"user_id": user_id}
    if status:
        # `$in` whether status is a single-element list (backward-compat
        # path for `?status=x`) or multi-element. A length-1 `$in` is
        # semantically equivalent to equality and Mongo's planner uses
        # the same index either way — no perf regression for the common
        # single-value caller.
        base_filter["status"] = {"$in": [s.value for s in status]}
    if category is not None:
        base_filter["category"] = category.value

    q_clean = q.strip() if q is not None else None
    if q_clean:
        pattern = re.escape(q_clean)
        base_filter["$or"] = [
            {"platform": {"$regex": pattern, "$options": "i"}},
            {"product_name": {"$regex": pattern, "$options": "i"}},
            {"order_id": {"$regex": pattern, "$options": "i"}},
        ]

    total_count = await db.count("purchases", base_filter)

    page_filter = apply_cursor_to_query(base_filter, cursor)
    fetched = await db.find_many(
        "purchases",
        page_filter,
        # Read-tolerant model so a single legacy doc with a now-invalid
        # enum or null required field doesn't 500 the page (every row is
        # validated in a list comprehension inside `find_many`).
        PurchaseReadTolerant,
        limit=limit + 1,
        sort=[("_id", 1)],
    )

    has_more = len(fetched) > limit
    visible = fetched[:limit]
    next_cursor = encode_cursor(str(visible[-1].id)) if has_more and visible else None

    return {
        "purchases": [p.model_dump(mode="json", by_alias=True) for p in visible],
        "next_cursor": next_cursor,
        "total_count": total_count,
    }


async def get_purchase_for_user(
    db: MongoDBClient,
    user_id: UUID,
    purchase_id: UUID,
) -> PurchaseReadTolerant:
    """Fetch a purchase owned by the user. Raises 404 otherwise.

    Returns the same 404 for missing-doc and wrong-owner cases so callers
    cannot probe for existence of another user's purchases. The return
    type is `PurchaseReadTolerant` so a legacy doc with a now-invalid
    enum value (e.g. `claim_type=None`) doesn't 500 the detail / confirm /
    dismiss paths. Writes still validate against the strict `Purchase`
    model via `db.partial_update("purchases", …, model=Purchase)`.
    """
    purchase = await db.get_purchase(purchase_id)
    if purchase is None or purchase.user_id != user_id:
        raise ApiError("not_found", "Purchase not found", status_code=404)
    return purchase


# Hard cap on price_history snapshots returned by the enriched detail
# bundle. Matches `find_price_history`'s default; production retention is
# capped by the 90-day TTL on `checked_at` (see create_indexes.py), so the
# practical worst case is the cadence-of-15-min sweep x 90 days ~ 8.6k
# rows. The detail page only plots a sparse timeline; 200 rows is
# generous headroom for visual fidelity without bloating the response.
_PRICE_HISTORY_DETAIL_CAP = 200


async def get_purchase_detail(
    db: MongoDBClient,
    user_id: UUID,
    purchase_id: UUID,
) -> tuple[PurchaseReadTolerant, list[PriceHistoryReadTolerant], list[dict[str, object]]]:
    """Assemble the enriched purchase-detail bundle in a single round-trip.

    Reads (in parallel via `asyncio.gather`):
      1. The owned Purchase (PurchaseReadTolerant). 404 if missing or
         owned by a different user.
      2. The purchase's price-history snapshots, sorted ASC by
         `checked_at` so the consumer (chart) gets a left-to-right
         timeline without re-sorting. Capped at `_PRICE_HISTORY_DETAIL_CAP`
         — anything older than the TTL is gone already.
      3. The claims tied to the purchase, owned by `user_id`. Reuses the
         shared `_CLAIM_LIST_PROJECT_STAGE` aggregation so each row is
         identical to a `/claims` list row.

    Returns:
        (purchase, price_history, claims) — caller serialises.

    Three tolerant reads on the hot detail path: a single legacy/rogue row
    in any of the three collections cannot 500 the page. Strict-on-write
    remains intact via `COLLECTION_MODELS`.
    """
    purchase = await get_purchase_for_user(db, user_id, purchase_id)

    # Run the price-history and claims reads in parallel. The purchase
    # read above is sequential because the ownership check gates whether
    # we read anything else at all — issuing those reads before the 404
    # would leak existence (and waste a round-trip on miss).
    price_history_task = db.find_price_history(
        purchase_id,
        limit=_PRICE_HISTORY_DETAIL_CAP,
        sort=[("checked_at", 1)],
    )
    claims_task = claims_service.list_claims_for_purchase(
        db=db,
        user_id=user_id,
        purchase_id=purchase_id,
    )
    price_history, claims = await asyncio.gather(price_history_task, claims_task)
    return purchase, price_history, claims


async def confirm_purchase(
    db: MongoDBClient,
    user: User,
    purchase_id: UUID,
    corrected_fields: dict[str, Any] | None,
) -> PurchaseReadTolerant:
    """Apply any user corrections and transition status → monitoring.

    Raises:
        ApiError(not_found, 404) if purchase is missing or not owned.
        ApiError(invalid_status, 409) if status is not pending_confirmation.
        ApiError(invalid_field, 400) if corrected_fields contains a
            system-managed or unknown key.
    """
    purchase = await get_purchase_for_user(db, user.id, purchase_id)

    # `purchase.status` is `str | None` on the tolerant model — compare
    # to the canonical enum value, not the enum instance.
    if purchase.status != PurchaseStatus.PENDING_CONFIRMATION.value:
        raise ApiError(
            "invalid_status",
            f"Purchase cannot be confirmed from status '{purchase.status}'",
            status_code=409,
        )

    updates: dict[str, Any] = {"status": PurchaseStatus.MONITORING}
    if corrected_fields:
        for key in corrected_fields:
            if key not in _ALLOWED_CORRECTABLE_FIELDS:
                raise ApiError(
                    "invalid_field",
                    f"Field '{key}' is not user-correctable",
                    status_code=400,
                )
        updates.update(corrected_fields)

    # Recompute `window_expires` server-side from the platform's Policy
    # (ticket 5.14). Upload-created sentinels start with `window_expires=now`;
    # the email-path extractor also sets it from the matching Policy now.
    # Confirm is the authoritative seam — the user-corrected `purchase_date`
    # / `platform` / `member_tier_at_purchase` flow into the computation so
    # whatever the user just locked in drives the monitoring window.
    #
    # `window_expires` is NOT in _ALLOWED_CORRECTABLE_FIELDS: the server
    # owns this number; a client trying to set it directly still 400s
    # at the allow-list check above.
    effective_platform = updates.get("platform") or purchase.platform
    effective_purchase_date = updates.get("purchase_date") or purchase.purchase_date
    effective_member_tier = updates.get("member_tier_at_purchase", purchase.member_tier_at_purchase)
    if effective_platform and effective_purchase_date:
        policy = await db.get_policy(effective_platform)
        if policy is None:
            # Latent data gap (e.g. extractor mapped to a platform not yet
            # in the Policy collection). Log and leave the existing
            # window_expires untouched — better than fabricating a 15-day
            # window that could mislead the monitor cron about when the
            # claim window closes.
            _log.warning(
                "Confirm window not recomputed: no Policy for platform=%s purchase_id=%s",
                effective_platform,
                purchase_id,
            )
        else:
            days = compute_window_days(policy, member_tier_at_purchase=effective_member_tier)
            # `purchase_date` may arrive as an ISO string when the user
            # supplied it via corrected_fields; normalize before
            # timedelta. A malformed string from the client (e.g.
            # `"not-a-date"`) used to surface as a 400 via Pydantic's
            # ValidationError inside `partial_update` below — now that
            # we touch the value first to compute `window_expires`, an
            # unhandled `datetime.fromisoformat` `ValueError` would
            # leak as a 500. Preserve the 400 contract by mapping
            # parse errors to the same `invalid_field` ApiError the
            # downstream partial_update would have raised.
            if isinstance(effective_purchase_date, datetime):
                pd = effective_purchase_date
            else:
                try:
                    pd = datetime.fromisoformat(str(effective_purchase_date).replace("Z", "+00:00"))
                except ValueError as err:
                    raise ApiError(
                        "invalid_field",
                        f"purchase_date is not a valid ISO datetime: {effective_purchase_date!r}",
                        status_code=400,
                    ) from err
            updates["window_expires"] = pd + timedelta(days=days)

    try:
        matched = await db.partial_update("purchases", purchase_id, updates, model=Purchase)
    except ValidationError as err:
        raise ApiError(
            "invalid_field",
            "One or more corrected fields failed validation",
            status_code=400,
            details=_validation_error_details(err),
        ) from err
    except ValueError as err:
        raise ApiError(
            "invalid_field",
            str(err),
            status_code=400,
        ) from err
    if not matched:
        # Document deleted between read and write — same surface as 404.
        raise ApiError("not_found", "Purchase not found", status_code=404)

    updated = await db.get_purchase(purchase_id)
    if updated is None:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    _log.info(
        "Purchase confirmed purchase_id=%s user_id=%s corrected_fields=%s",
        purchase_id,
        user.id,
        sorted(corrected_fields.keys()) if corrected_fields else [],
    )
    return updated


async def dismiss_purchase(
    db: MongoDBClient,
    user: User,
    purchase_id: UUID,
    reason: DismissReason,
    remember_sender: bool,
    sender: str | None,
) -> dict[str, object]:
    """Mark a pending purchase dismissed; optionally write the skiplist.

    `sender` is accepted for backward compat with frontend wiring
    (issue #103) — once Purchase carries the original email sender, the
    request body will shrink to just `{reason, remember_sender}`.
    Skiplist writes are best-effort: a Mongo error is logged but does
    not fail the dismiss.

    Returns the response envelope (dict) so the route doesn't have to
    reshape — keeps the dismiss handler trivial.
    """
    purchase = await get_purchase_for_user(db, user.id, purchase_id)

    if purchase.status != PurchaseStatus.PENDING_CONFIRMATION.value:
        raise ApiError(
            "invalid_status",
            f"Purchase cannot be dismissed from status '{purchase.status}'",
            status_code=409,
        )

    matched = await db.partial_update(
        "purchases",
        purchase_id,
        {"status": PurchaseStatus.DISMISSED},
        model=Purchase,
    )
    if not matched:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    skiplist_written = False
    if remember_sender and reason in ("not_an_order", "other"):
        try:
            skiplist_written = await _append_ingestion_skiplist(
                user=user,
                purchase=purchase,
                sender=sender,
                reason=reason,
                db=db,
            )
        except Exception:
            _log.exception(
                "Skiplist write failed (best-effort) purchase_id=%s user_id=%s",
                purchase_id,
                user.id,
            )

    _log.info(
        "Purchase dismissed purchase_id=%s user_id=%s reason=%s remember=%s skiplist=%s",
        purchase_id,
        user.id,
        reason,
        remember_sender,
        skiplist_written,
    )
    return {
        "success": True,
        "purchase_id": str(purchase_id),
        "status": PurchaseStatus.DISMISSED,
        "reason": reason,
        "skiplist_written": skiplist_written,
    }


async def _append_ingestion_skiplist(
    *,
    user: User,
    purchase: PurchaseReadTolerant,
    sender: str | None,
    reason: str,
    db: MongoDBClient,
) -> bool:
    """Append an IngestionSkiplistEntry. Returns False on duplicate (no-op)."""
    format_hash = purchase.format_hash
    if not format_hash:
        _log.warning(
            "Dismiss without format_hash; skipping skiplist write purchase_id=%s",
            purchase.id,
        )
        return False

    cleaned = normalize_sender(sender or purchase.sender or "")
    if not cleaned:
        _log.warning(
            "Dismiss with remember_sender but no sender; storing 'unknown' purchase_id=%s",
            purchase.id,
        )
        cleaned = "unknown"

    now = datetime.now(UTC)
    entry = IngestionSkiplistEntry(
        sender=cleaned,
        format_hash=format_hash,
        added_at=now,
        reason=reason,
    )

    if any(
        normalize_sender(e.sender) == entry.sender and e.format_hash == entry.format_hash
        for e in user.ingestion_skiplist
    ):
        return False

    updated_skiplist = [*user.ingestion_skiplist, entry]
    if len(updated_skiplist) > SKIPLIST_MAX_ENTRIES:
        updated_skiplist = updated_skiplist[-SKIPLIST_MAX_ENTRIES:]
    user.ingestion_skiplist = updated_skiplist
    user.updated_at = now
    await db.upsert("users", user.id, user)
    return True


def _parse_gs_uri(uri: str) -> tuple[str, str]:
    """Split a `gs://bucket/path/with/slashes` URI into `(bucket, path)`.

    Raises `ValueError` for any malformed input. The caller maps that to
    a 404 rather than a 500 so a stored bogus URI doesn't leak as an
    internal-error surface to the client.
    """
    if not uri.startswith("gs://"):
        raise ValueError(f"Not a gs:// URI: {uri!r}")
    remainder = uri[len("gs://") :]
    bucket, sep, path = remainder.partition("/")
    if not bucket or not sep or not path:
        raise ValueError(f"Malformed gs:// URI (missing bucket or path): {uri!r}")
    return bucket, path


async def fetch_receipt_for_user(
    *,
    db: MongoDBClient,
    uploader: ReceiptsUploader,
    user_id: UUID,
    purchase_id: UUID,
) -> tuple[bytes, str]:
    """Fetch a receipt blob for the route layer, scoped to the owning user.

    Mirrors `get_purchase_for_user`'s "404, never 403" surface — we don't
    leak existence across users, and we don't leak "object exists but
    inaccessible" semantics across receipt URLs.

    404 surfaces (caller maps to ApiError):
      - Purchase missing or owned by a different user.
      - Purchase has no `receipt_storage_url` (Gmail ingest case).
      - Stored URI is not under the configured RECEIPTS_BUCKET (corrupt
        data; refuse to read from any other bucket even if SA happens
        to have access — defence-in-depth against a bad write).
      - Stored URI is malformed.
      - Blob does not exist in GCS.
    """
    purchase = await get_purchase_for_user(db, user_id, purchase_id)
    if not purchase.receipt_storage_url:
        raise ApiError("not_found", "Receipt not found", status_code=404)

    try:
        bucket, blob_path = _parse_gs_uri(purchase.receipt_storage_url)
    except ValueError:
        _log.warning(
            "Malformed receipt_storage_url purchase_id=%s url=%r",
            purchase_id,
            purchase.receipt_storage_url,
        )
        raise ApiError("not_found", "Receipt not found", status_code=404) from None

    if bucket != uploader.bucket_name:
        _log.warning(
            "Receipt URI bucket mismatch purchase_id=%s uri_bucket=%s expected=%s",
            purchase_id,
            bucket,
            uploader.bucket_name,
        )
        raise ApiError("not_found", "Receipt not found", status_code=404)

    try:
        return await uploader.download(blob_path=blob_path)
    except ReceiptObjectMissingError:
        _log.warning(
            "Receipt blob missing in GCS purchase_id=%s blob_path=%s",
            purchase_id,
            blob_path,
        )
        raise ApiError("not_found", "Receipt not found", status_code=404) from None


async def upload_receipt(
    *,
    db: MongoDBClient,
    uploader: ReceiptsUploader,
    publisher: PubSubPublisher,
    user: User,
    file_bytes: bytes,
    content_type: str,
    filename: str | None,
) -> Purchase:
    """Persist an uploaded receipt and create a pending_confirmation Purchase.

    The new Purchase carries sentinel field values (price_paid=0.01,
    empty strings for ids/names, etc.) because nothing has been
    extracted yet — the ingest agent will overwrite these once the
    purchase.uploaded Pub/Sub event lands on its push handler. Status
    is `pending_confirmation` so consumers know not to trust the field
    values yet.

    Three side effects, ordered for clean rollback (ticket 5.14):
      1. GCS write — if this fails, nothing else has happened; raise.
      2. Mongo upsert — if this fails, the GCS blob is orphaned but
         no doc exists; the orphan costs storage cents at worst and
         the cleanup script can sweep. Raise.
      3. Pub/Sub publish — if this fails, the user thinks the upload
         worked (we'd otherwise return 200 with a doc that will never
         get extracted). Delete the purchase doc, log the orphan blob
         for ops, and surface 503 so the client retries the whole
         flow. This matches the claim-approval pattern in
         services/claims_service.publish_claim_approval.

    Raises:
        ApiError(unsupported_media_type, 415) for non-PDF/PNG/JPEG.
        ApiError(file_too_large, 413) for files > 10 MB.
        ApiError(publish_failed, 503) when the broker rejects the
            purchase.uploaded message after the doc was written.
    """
    ingestion_source = validate_upload_content_type(content_type)
    validate_upload_size(len(file_bytes))

    purchase_id = uuid.uuid4()
    now = datetime.now(UTC)
    blob_path = _build_receipt_blob_path(
        user_id=user.id,
        purchase_id=purchase_id,
        filename=filename,
        content_type=content_type,
        uploaded_at=now,
    )

    storage_url = await uploader.upload(
        data=file_bytes,
        content_type=content_type,
        blob_path=blob_path,
    )

    purchase = Purchase(
        id=purchase_id,
        user_id=user.id,
        status=PurchaseStatus.PENDING_CONFIRMATION,
        ingestion_source=ingestion_source,
        receipt_storage_url=storage_url,
        receipt_hash=None,
        purchase_date=now,
        # window_expires is filled by ingest extraction; default to now so
        # the field is non-null. Status pending_confirmation prevents the
        # monitor-agent from treating window as authoritative.
        window_expires=now,
        ingested_at=now,
        updated_at=now,
        extraction_confidence=ExtractionConfidence(
            platform=0.0,
            price=0.0,
            overall_min=0.0,
        ),
        **_UPLOAD_PURCHASE_DEFAULTS,
    )
    await db.upsert("purchases", purchase_id, purchase)

    event = PurchaseUploadedEvent(
        user_id=str(user.id),
        purchase_id=str(purchase_id),
        receipt_storage_url=storage_url,
        content_type=content_type,
    )
    try:
        await publisher.publish(TOPIC_PURCHASE_UPLOADED, event.model_dump(mode="json"))
    except Exception:
        _log.exception(
            "Failed to publish purchase.uploaded for purchase_id=%s; rolling back doc",
            purchase_id,
        )
        try:
            await db.delete("purchases", purchase_id)
        except Exception:
            # Rollback itself failed — the doc is stranded as a sentinel
            # pending_confirmation that no ingest event will fire for.
            # Surface in logs so on-call can clean up; user still gets
            # 503 below so retry is the right next action.
            _log.exception(
                "Rollback failed after publish failure for purchase %s; manual fix required",
                purchase_id,
            )
        else:
            # Doc deleted; the GCS object is now orphaned. Cheap to
            # leave (10 MB cap, storage costs cents), and a future
            # bucket-lifecycle sweep based on missing-doc lookup can
            # clean it up. Log so the orphan is discoverable.
            _log.warning(
                "Orphaned receipt blob after publish-rollback purchase_id=%s blob=%s",
                purchase_id,
                storage_url,
            )
        raise ApiError(
            "publish_failed",
            "Upload failed; please retry.",
            status_code=503,
        ) from None

    _log.info(
        "Receipt uploaded purchase_id=%s user_id=%s content_type=%s bytes=%d",
        purchase_id,
        user.id,
        content_type,
        len(file_bytes),
    )
    return purchase


def validate_upload_content_type(content_type: str) -> IngestionSource:
    ingestion_source = _ALLOWED_UPLOAD_CONTENT_TYPES.get(content_type)
    if ingestion_source is None:
        raise ApiError(
            "unsupported_media_type",
            f"Unsupported content type: {content_type}. Allowed: PDF, PNG, JPEG.",
            status_code=415,
        )
    return ingestion_source


def validate_upload_size(size_bytes: int) -> None:
    if size_bytes > MAX_UPLOAD_BYTES:
        raise ApiError(
            "file_too_large",
            f"File exceeds {MAX_UPLOAD_BYTES} byte limit",
            status_code=413,
        )


def _validation_error_details(err: ValidationError) -> dict[str, object]:
    return {
        "fields": [
            {"loc": item.get("loc"), "type": item.get("type"), "msg": item.get("msg")}
            for item in err.errors()
        ]
    }


_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _build_receipt_blob_path(
    *,
    user_id: UUID,
    purchase_id: UUID,
    filename: str | None,
    content_type: str,
    uploaded_at: datetime,
) -> str:
    """GCS path: receipts/{user_id}/{purchase_id}/{ts}-{safe_filename}.

    Filename is sanitised to ASCII-safe chars to prevent header injection
    or path-traversal attempts via the multipart filename field.
    """
    ts = uploaded_at.strftime("%Y%m%dT%H%M%SZ")
    if filename:
        cleaned = _FILENAME_SAFE.sub("_", filename).strip("._-") or "receipt"
    else:
        ext = {
            "application/pdf": "pdf",
            "image/png": "png",
            "image/jpeg": "jpg",
        }.get(content_type, "bin")
        cleaned = f"receipt.{ext}"
    return f"receipts/{user_id}/{purchase_id}/{ts}-{cleaned}"
