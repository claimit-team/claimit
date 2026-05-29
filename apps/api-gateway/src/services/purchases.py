"""Purchases service: list/detail/confirm/dismiss/upload business logic.

See Attachment 2 §3.3 for the endpoint contract. Routes in
`routes/purchases.py` are thin wrappers that adapt request/response
shapes; all DB and storage work lives here.
"""

from __future__ import annotations

import asyncio
import hashlib
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
    IngestionSkiplistEntry,
    IngestionSource,
    MongoDBClient,
    Platform,
    PriceHistoryReadTolerant,
    Purchase,
    PurchaseReadTolerant,
    PurchaseStatus,
    User,
    compute_window_days,
    normalize_sender,
)
from claimit_pubsub import TOPIC_PURCHASE_INGESTED, PurchaseIngestedEvent
from pydantic import TypeAdapter, ValidationError
from pymongo.errors import DuplicateKeyError

from ..middleware.errors import ApiError
from ..middleware.pagination import apply_cursor_to_query, encode_cursor
from ..services import claims_service, ingest_client
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

# Statuses that surface the review/correction form. The ingest extractor
# routes low-confidence extractions to `pending_confirmation` and
# multi-item / synthesized-product-id receipts to `pending_user_edit`;
# both submit through the same /confirm and /dismiss endpoints and
# transition to `monitoring` (or `dismissed`) from here.
_REVIEWABLE_STATUSES: frozenset[str] = frozenset(
    {
        PurchaseStatus.PENDING_CONFIRMATION.value,
        PurchaseStatus.PENDING_USER_EDIT.value,
    }
)

# The two live monitoring states. "Stop monitoring" and "re-upload
# receipt" both act on an actively-monitored purchase — not on a
# pending_* one (those use /confirm or /dismiss) and not on a terminal
# claimed/expired/refunded/dismissed one.
_MONITORING_STATUSES: frozenset[str] = frozenset(
    {
        PurchaseStatus.MONITORING.value,
        PurchaseStatus.MONITORING_DEGRADED.value,
    }
)

_ALLOWED_UPLOAD_CONTENT_TYPES: dict[str, IngestionSource] = {
    "application/pdf": IngestionSource.UPLOAD_PDF,
    "image/png": IngestionSource.UPLOAD_IMAGE,
    "image/jpeg": IngestionSource.UPLOAD_IMAGE,
}

# 10 MB per Attachment 2 §3.3 + acceptance criteria.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Default monitoring cadence for a purchase created from a confirmed upload
# when the user did not pick one (server-owned; not extracted).
_DEFAULT_MONITORING_CADENCE_MINUTES = 360

# Purchase fields declared `X | None` WITHOUT a model default, so Pydantic
# still requires the key to be present. The extractor always supplies these;
# the manual-fill path (extraction=None) must default them to None so the
# Purchase validates from corrected_fields alone.
_NULLABLE_PURCHASE_FIELDS: tuple[str, ...] = (
    "product_url",
    "variant",
    "fare_class",
    "room_type",
    "bed_type",
    "rate_type",
    "member_tier_at_purchase",
)


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


async def update_purchase_product_url(
    db: MongoDBClient,
    user: User,
    purchase_id: UUID,
    product_url: str | None,
) -> PurchaseReadTolerant:
    """Set `product_url` on a confirmed purchase and clear monitor-failure state.

    Narrow allowlist on purpose — this route is the remediation lane for
    BUG-19 (monitor agent blocked when product_url is missing) and is not a
    general-purpose edit endpoint. Pre-confirmation edits still flow through
    `/confirm` with `corrected_fields`.

    Side effect: clears `last_monitor_error`, `last_monitor_error_at`,
    `last_monitor_error_code` so the UI returns to the standard waiting
    state immediately rather than carrying the stale "blocked" badge until
    the next cron tick.

    Raises:
        ApiError(not_found, 404) if the purchase is missing or not owned.
        ApiError(invalid_field, 400) if `product_url` fails Pydantic validation.
    """
    purchase = await get_purchase_for_user(db, user.id, purchase_id)

    updates: dict[str, Any] = {
        "product_url": product_url,
        "last_monitor_error": None,
        "last_monitor_error_at": None,
        "last_monitor_error_code": None,
    }
    try:
        matched = await db.partial_update("purchases", purchase_id, updates, model=Purchase)
    except ValidationError as err:
        raise ApiError(
            "invalid_field",
            "product_url failed validation",
            status_code=400,
            details=_validation_error_details(err),
        ) from err
    if not matched:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    updated = await db.get_purchase(purchase_id)
    if updated is None:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    _log.info(
        "Purchase product_url updated purchase_id=%s user_id=%s had_url=%s",
        purchase_id,
        user.id,
        purchase.product_url is not None,
    )
    return updated


async def stop_monitoring(
    db: MongoDBClient,
    user: User,
    purchase_id: UUID,
) -> PurchaseReadTolerant:
    """Stop tracking a monitored purchase (BUG-85).

    Transitions a `monitoring` / `monitoring_degraded` purchase to
    `dismissed` — the only terminal "off" state the schema carries, and
    the one the frontend already renders as a neutral "Stopped" badge.
    The monitor cron scans `status:"monitoring"` only, so leaving that
    state is what actually halts the price sweep.

    Deliberately a DEDICATED endpoint rather than POST /dismiss: dismiss
    carries a "this was misidentified" reason enum + optional skiplist
    write, neither of which applies to "I'm done watching this".

    Raises:
        ApiError(not_found, 404) if the purchase is missing or not owned.
        ApiError(invalid_status, 409) if the purchase is not currently
            monitoring (pending_* / terminal states cannot be stopped).
    """
    purchase = await get_purchase_for_user(db, user.id, purchase_id)

    if purchase.status not in _MONITORING_STATUSES:
        raise ApiError(
            "invalid_status",
            f"Purchase cannot be stopped from status '{purchase.status}'",
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

    updated = await db.get_purchase(purchase_id)
    if updated is None:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    _log.info(
        "Purchase monitoring stopped purchase_id=%s user_id=%s prev_status=%s",
        purchase_id,
        user.id,
        purchase.status,
    )
    return updated


async def confirm_purchase(
    db: MongoDBClient,
    user: User,
    purchase_id: UUID,
    corrected_fields: dict[str, Any] | None,
) -> PurchaseReadTolerant:
    """Apply any user corrections and transition status → monitoring.

    Raises:
        ApiError(not_found, 404) if purchase is missing or not owned.
        ApiError(invalid_status, 409) if status is not one of the
            reviewable states (`pending_confirmation`, `pending_user_edit`).
        ApiError(invalid_field, 400) if corrected_fields contains a
            system-managed or unknown key.
    """
    purchase = await get_purchase_for_user(db, user.id, purchase_id)

    # `purchase.status` is `str | None` on the tolerant model — compare
    # to the canonical enum values, not the enum instances. Both
    # `pending_confirmation` (low-confidence extraction) and
    # `pending_user_edit` (multi-item / synthesized product_id from the
    # ingest extractor) flow through the same review form and submit
    # path here; everything else is terminal or already monitoring.
    if purchase.status not in _REVIEWABLE_STATUSES:
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
    # (ticket 5.14). Confirm is the authoritative seam — the user-corrected
    # `purchase_date` / `platform` / `member_tier_at_purchase` flow into the
    # computation so whatever the user just locked in drives the monitoring
    # window. `window_expires` is NOT in _ALLOWED_CORRECTABLE_FIELDS: the
    # server owns this number; a client trying to set it directly still 400s
    # at the allow-list check above. `.get(default)` (not `or`) so a
    # falsy-but-present correction short-circuits the resolver's guard and
    # the 400 surfaces from the partial_update path with the right field loc.
    effective_platform = updates.get("platform", purchase.platform)
    effective_purchase_date = updates.get("purchase_date", purchase.purchase_date)
    effective_member_tier = updates.get("member_tier_at_purchase", purchase.member_tier_at_purchase)
    window_expires = await _resolve_window_expires(
        db,
        platform=effective_platform,
        purchase_date=effective_purchase_date,
        member_tier_at_purchase=effective_member_tier,
        log_ref=purchase_id,
    )
    if window_expires is not None:
        updates["window_expires"] = window_expires

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

    if purchase.status not in _REVIEWABLE_STATUSES:
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
    uploader: ReceiptsUploader,
    user: User,
    file_bytes: bytes,
    content_type: str,
    filename: str | None,
) -> dict[str, Any]:
    """Store an uploaded receipt in GCS and extract its fields — NO Mongo write.

    Write-after-confirm flow: the receipt blob goes to GCS, the
    ingest-agent extracts the fields synchronously, and the extracted
    fields are handed back to the browser. Nothing is persisted to the
    `purchases` collection and no Pub/Sub event is published — the
    Purchase is created only when the user confirms (see
    `create_purchase_from_confirm`). This means re-uploading the same
    receipt before confirming can never collide with a unique index or
    leave a "stuck analyzing" sentinel.

    Returns a dict the route hands to the FE:
        {
          "storage_url":  gs:// URI of the stored blob,
          "content_type": echoed mime,
          "receipt_hash": "sha256:<digest>" of the raw bytes (carried back
                          at confirm time so the dedup index can protect
                          identical re-confirms),
          "extraction":   the extracted fields + computed status +
                          extraction_confidence, or None when the
                          extractor could not read the receipt (the FE
                          then opens the manual-fill form).
        }

    Raises:
        ApiError(unsupported_media_type, 415) for non-PDF/PNG/JPEG.
        ApiError(file_too_large, 413) for files > 10 MB.
    """
    validate_upload_content_type(content_type)
    validate_upload_size(len(file_bytes))

    # `staging_id` only names the GCS path — there is no purchase yet. The
    # path keeps the user_id prefix so confirm can assert ownership.
    staging_id = uuid.uuid4()
    now = datetime.now(UTC)
    blob_path = _build_receipt_blob_path(
        user_id=user.id,
        purchase_id=staging_id,
        filename=filename,
        content_type=content_type,
        uploaded_at=now,
    )

    storage_url = await uploader.upload(
        data=file_bytes,
        content_type=content_type,
        blob_path=blob_path,
    )
    receipt_hash = f"sha256:{hashlib.sha256(file_bytes).hexdigest()}"

    try:
        extraction: dict[str, Any] | None = await ingest_client.extract_receipt(
            user_id=str(user.id),
            storage_url=storage_url,
            content_type=content_type,
        )
    except ingest_client.IngestExtractError as err:
        # Extractor rejected / failed — surface a manual-fill form rather
        # than a hard error. The blob stays in GCS and is attached on
        # confirm. Old async pipeline did the same via _rescue_extraction.
        _log.warning(
            "Upload extraction unavailable; FE opens manual-fill form "
            "user_id=%s storage_url=%s code=%s",
            user.id,
            storage_url,
            err.code,
        )
        extraction = None

    _log.info(
        "Receipt uploaded (unpersisted) staging_id=%s user_id=%s content_type=%s "
        "bytes=%d extracted=%s",
        staging_id,
        user.id,
        content_type,
        len(file_bytes),
        extraction is not None,
    )
    return {
        "storage_url": storage_url,
        "content_type": content_type,
        "receipt_hash": receipt_hash,
        "extraction": extraction,
    }


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


def _validation_error_details(
    err: ValidationError,
    *,
    loc_prefix: tuple[str, ...] = (),
) -> dict[str, object]:
    """Serialise a Pydantic `ValidationError` for the ApiError `details` payload.

    `loc_prefix` is prepended to each error item's `loc` tuple. Defaults
    to `()` so existing callers that already validate via a Pydantic
    model (e.g. `partial_update(..., model=Purchase)`) are unchanged —
    the model already supplies the field name in `loc`. The kwarg is
    used by call sites that validate a single value via
    `TypeAdapter(SomeType).validate_python(...)`, where Pydantic
    returns `loc=()` and the field name has to be added by the caller
    so the frontend's per-field error rendering can attach the message
    to the right input.
    """
    return {
        "fields": [
            {
                "loc": loc_prefix + tuple(item.get("loc") or ()),
                "type": item.get("type"),
                "msg": item.get("msg"),
            }
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


async def _resolve_window_expires(
    db: MongoDBClient,
    *,
    platform: Any,
    purchase_date: Any,
    member_tier_at_purchase: str | None,
    log_ref: object,
    fallback_default: bool = False,
) -> datetime | None:
    """Compute `window_expires` from the platform's Policy.

    Shared by `confirm_purchase` (update path) and
    `create_purchase_from_confirm` (create path). Returns the computed
    timestamp, or None when it cannot be computed and the caller should
    leave the existing value untouched:
      - `platform` / `purchase_date` falsy → None.
      - no matching Policy and `fallback_default=False` → None (confirm
        path leaves the existing window rather than fabricating one).

    When `fallback_default=True` (create path), a missing Policy still
    yields a window via `compute_window_days(None, …)`'s 15-day default —
    a freshly-created purchase must have a non-null `window_expires`.

    Raises ApiError(invalid_field, 400) when `purchase_date` is a
    malformed value (mirrors the downstream Purchase validation error
    shape so the FE highlights the right field).
    """
    if not (platform and purchase_date):
        return None
    platform_value = platform.value if isinstance(platform, Platform) else platform
    policy = await db.get_policy(platform_value)
    if policy is None and not fallback_default:
        _log.warning(
            "Window not recomputed: no Policy for platform=%s ref=%s",
            platform_value,
            log_ref,
        )
        return None
    days = compute_window_days(policy, member_tier_at_purchase=member_tier_at_purchase)
    try:
        pd = TypeAdapter(datetime).validate_python(purchase_date)
    except ValidationError as err:
        raise ApiError(
            "invalid_field",
            "One or more corrected fields failed validation",
            status_code=400,
            details=_validation_error_details(err, loc_prefix=("purchase_date",)),
        ) from err
    return pd + timedelta(days=days)


# Statuses that mean a purchase is already committed (the user confirmed it
# and it is being tracked). Re-uploading a receipt for one of these is a
# true duplicate and is blocked. Pre-confirmation states
# (pending_confirmation / pending_user_edit) and `dismissed` are NOT here:
# the user is allowed to re-upload freely until they confirm.
_COMMITTED_PURCHASE_STATUSES: list[str] = [
    PurchaseStatus.MONITORING.value,
    PurchaseStatus.MONITORING_DEGRADED.value,
    PurchaseStatus.CLAIMED.value,
    PurchaseStatus.EXPIRED.value,
    PurchaseStatus.REFUNDED.value,
]


def _duplicate_receipt_error() -> ApiError:
    return ApiError(
        "duplicate",
        "You've already added this receipt.",
        status_code=409,
    )


async def _assert_not_duplicate_purchase(
    db: MongoDBClient,
    *,
    user_id: UUID,
    platform: Any,
    order_id: str | None,
    receipt_hash: str | None,
    exclude_purchase_id: UUID | None = None,
) -> None:
    """Block confirm-create when this receipt duplicates a committed purchase.

    Two checks, both scoped to `_COMMITTED_PURCHASE_STATUSES` so a user can
    still re-upload freely before confirming:
      1. `(user_id, platform, order_id)` for a non-empty order_id — mirrors
         the unique partial index (`order_id > ""`).
      2. `receipt_hash` — identical receipt bytes already confirmed.
    Raises ApiError(duplicate, 409) on the first match.

    `exclude_purchase_id` excludes a single document from BOTH checks. The
    re-upload path (BUG-85) passes the purchase being re-uploaded so its
    OWN committed row doesn't false-match — re-uploading the identical
    receipt, or keeping the same order_id, must not 409 against itself.
    """
    exclude_clause: dict[str, Any] = (
        {"_id": {"$ne": exclude_purchase_id}} if exclude_purchase_id is not None else {}
    )
    platform_value = platform.value if isinstance(platform, Platform) else platform
    if platform_value and order_id:
        existing = await db.find_one(
            "purchases",
            {
                "user_id": user_id,
                "platform": platform_value,
                "order_id": order_id,
                "status": {"$in": _COMMITTED_PURCHASE_STATUSES},
                **exclude_clause,
            },
            PurchaseReadTolerant,
        )
        if existing is not None:
            raise _duplicate_receipt_error()

    if receipt_hash:
        existing = await db.find_one(
            "purchases",
            {
                "receipt_hash": receipt_hash,
                "status": {"$in": _COMMITTED_PURCHASE_STATUSES},
                **exclude_clause,
            },
            PurchaseReadTolerant,
        )
        if existing is not None:
            raise _duplicate_receipt_error()


def _validate_receipt_storage_url(
    storage_url: str,
    *,
    user_id: UUID,
    bucket_name: str,
) -> None:
    """Reject a client-supplied receipt URL that isn't this user's own blob.

    Defense-in-depth: the URL is carried client-side between upload and
    confirm, so never trust it blindly. Enforce that it is a gs:// URI in
    the configured receipts bucket and under the caller's `receipts/{uid}/`
    prefix — otherwise a client could attach another user's (or another
    bucket's) object to their new purchase and read it back via the
    receipt proxy. The read path also checks bucket + ownership, so this
    is the second layer.
    """
    try:
        bucket, blob_path = _parse_gs_uri(storage_url)
    except ValueError as err:
        raise ApiError("invalid_field", "Invalid receipt reference", status_code=400) from err
    if bucket != bucket_name or not blob_path.startswith(f"receipts/{user_id}/"):
        raise ApiError(
            "invalid_field",
            "Receipt reference does not belong to this user",
            status_code=400,
        )


async def create_purchase_from_confirm(
    *,
    db: MongoDBClient,
    uploader: ReceiptsUploader,
    publisher: PubSubPublisher,
    user: User,
    storage_url: str,
    content_type: str,
    extraction: dict[str, Any] | None,
    corrected_fields: dict[str, Any] | None,
) -> Purchase:
    """Create the Purchase for a confirmed upload — the first Mongo write.

    Write-after-confirm: nothing was persisted at upload time. The user has
    now reviewed the extracted fields (carried from the upload response) and
    confirmed, so we build the full Purchase here, transition it straight to
    `monitoring`, dedup against already-committed purchases, persist, and
    publish `purchase.ingested` so the monitor-agent starts tracking.

    `extraction` is the dict the ingest extractor returned (None when the
    extractor failed and the user filled the form by hand). `corrected_fields`
    are the user's edits — validated against `_ALLOWED_CORRECTABLE_FIELDS`,
    same as `confirm_purchase`.

    `receipt_hash` is recomputed server-side from the GCS object (NOT trusted
    from the client), so a forged/omitted hash can't bypass same-receipt
    dedup or poison the global unique index.

    Raises:
        ApiError(unsupported_media_type, 415) for a bad content_type.
        ApiError(invalid_field, 400) for a disallowed corrected key, a
            receipt URL that isn't the user's own, or fields that fail
            Purchase validation (missing/invalid after merge).
        ApiError(receipt_missing, 400) when the uploaded blob is gone.
        ApiError(duplicate, 409) when the receipt duplicates a committed
            purchase (pre-check) or hits the unique index (backstop).
    """
    ingestion_source = validate_upload_content_type(content_type)
    _validate_receipt_storage_url(storage_url, user_id=user.id, bucket_name=uploader.bucket_name)

    # Recompute the receipt hash from the stored object — never trust the
    # client-carried value (it could be forged to bypass dedup or poison the
    # global receipt_hash unique index against another user's receipt).
    _bucket, blob_path = _parse_gs_uri(storage_url)
    try:
        receipt_bytes, _blob_ct = await uploader.download(blob_path=blob_path)
    except ReceiptObjectMissingError as err:
        raise ApiError(
            "receipt_missing",
            "Uploaded receipt is no longer available; please re-upload.",
            status_code=400,
        ) from err
    receipt_hash = f"sha256:{hashlib.sha256(receipt_bytes).hexdigest()}"

    if corrected_fields:
        for key in corrected_fields:
            if key not in _ALLOWED_CORRECTABLE_FIELDS:
                raise ApiError(
                    "invalid_field",
                    f"Field '{key}' is not user-correctable",
                    status_code=400,
                )

    # Merge extracted fields with the user's corrections. corrected_fields
    # wins (it's the user's final say). `status` is server-owned and stripped.
    merged: dict[str, Any] = dict(extraction) if extraction else {}
    merged.update(corrected_fields or {})
    merged.pop("status", None)

    eff_platform = merged.get("platform")
    eff_order_id = merged.get("order_id") or ""
    eff_member_tier = merged.get("member_tier_at_purchase")
    eff_purchase_date = merged.get("purchase_date")

    await _assert_not_duplicate_purchase(
        db,
        user_id=user.id,
        platform=eff_platform,
        order_id=eff_order_id,
        receipt_hash=receipt_hash,
    )

    now = datetime.now(UTC)
    purchase_id = uuid.uuid4()
    window_expires = await _resolve_window_expires(
        db,
        platform=eff_platform,
        purchase_date=eff_purchase_date,
        member_tier_at_purchase=eff_member_tier,
        log_ref=purchase_id,
        fallback_default=True,
    )

    if extraction and extraction.get("extraction_confidence"):
        confidence = extraction["extraction_confidence"]
    else:
        # Manual fill (extractor failed): the user typed every field, so
        # treat it as fully confident.
        confidence = {"platform": 1.0, "price": 1.0, "overall_min": 1.0}

    # Server-owned fields override anything carried from the client.
    merged.update(
        {
            "_id": purchase_id,
            "user_id": user.id,
            "status": PurchaseStatus.MONITORING,
            "ingestion_source": ingestion_source,
            "receipt_storage_url": storage_url,
            "receipt_hash": receipt_hash,
            "ingested_at": now,
            "updated_at": now,
            "window_expires": window_expires or now,
            "currency": "USD",
            "claim_type": ClaimType.SELF_SERVICE,
            "extraction_confidence": confidence,
        }
    )
    merged.setdefault("monitoring_cadence_minutes", _DEFAULT_MONITORING_CADENCE_MINUTES)
    merged.setdefault("product_id", "")
    merged.setdefault("order_id", "")
    # Nullable Purchase fields that have no model-level default (declared
    # `str | None` without `= None`, so Pydantic requires the key to be
    # present). The extractor supplies these; on manual fill they're absent.
    for nullable_field in _NULLABLE_PURCHASE_FIELDS:
        merged.setdefault(nullable_field, None)

    try:
        purchase = Purchase.model_validate(merged)
    except ValidationError as err:
        raise ApiError(
            "invalid_field",
            "One or more fields failed validation",
            status_code=400,
            details=_validation_error_details(err),
        ) from err

    try:
        await db.upsert("purchases", purchase_id, purchase)
    except DuplicateKeyError as err:
        # Backstop for the unique partial indexes (order_id triple /
        # receipt_hash) — e.g. racing with an in-flight Gmail sentinel the
        # committed-status pre-check intentionally doesn't cover.
        _log.info(
            "Confirm-create dedup collision user_id=%s platform=%s order_id=%s",
            user.id,
            eff_platform,
            eff_order_id,
        )
        raise _duplicate_receipt_error() from err

    # Kick off monitoring. Best-effort: the purchase is already the
    # source-of-truth committed record, so a broker hiccup must NOT roll it
    # back. Log loudly — a missed event delays monitoring until the next
    # reconciliation, it doesn't lose the purchase.
    event = PurchaseIngestedEvent(
        user_id=str(user.id),
        purchase_id=str(purchase_id),
        platform=str(purchase.platform.value),
        category=purchase.category.value,
        status=purchase.status.value,
        ingestion_source=purchase.ingestion_source.value,
        overall_confidence=purchase.extraction_confidence.overall_min,
    )
    try:
        await publisher.publish(TOPIC_PURCHASE_INGESTED, event.model_dump(mode="json"))
    except Exception:
        _log.exception(
            "Failed to publish purchase.ingested after confirm-create purchase_id=%s; "
            "monitoring may be delayed",
            purchase_id,
        )

    _log.info(
        "Purchase created from confirmed upload purchase_id=%s user_id=%s "
        "platform=%s manual_fill=%s",
        purchase_id,
        user.id,
        eff_platform,
        extraction is None,
    )
    return purchase


async def reupload_receipt(
    *,
    db: MongoDBClient,
    uploader: ReceiptsUploader,
    user: User,
    purchase_id: UUID,
    storage_url: str,
    content_type: str,
    extraction: dict[str, Any] | None,
    corrected_fields: dict[str, Any] | None,
) -> PurchaseReadTolerant:
    """Replace the receipt on a monitored purchase and apply its fields (BUG-85).

    The user uploaded a corrected receipt (via POST /upload — same flow as
    onboarding, no Mongo write), reviewed the freshly-extracted fields, and
    confirmed. We update the EXISTING purchase in place: swap
    `receipt_storage_url` / `receipt_hash`, apply the reviewed fields, clear
    any stale monitor-failure trail, recompute the refund window, and keep
    the purchase monitoring. No re-ingest event is published — the purchase
    is already tracked.

    Field application mirrors `create_purchase_from_confirm`: the new
    `extraction` provides the baseline and `corrected_fields` (the user's
    edits in the review form) win on top. Only `_ALLOWED_CORRECTABLE_FIELDS`
    are written — system-owned keys carried in the extraction (status,
    currency, etc.) are dropped. The review form is the clobber-safeguard:
    whatever the user confirmed is the new truth, so accepting a corrected
    extraction verbatim genuinely replaces the wrong original values.

    `receipt_hash` is recomputed server-side from the stored object (never
    trusted from the client). The dedup pre-check excludes THIS purchase so
    re-uploading the identical receipt (or keeping the same order_id) does
    not 409 against the purchase's own committed row.

    Raises:
        ApiError(not_found, 404) if the purchase is missing or not owned.
        ApiError(invalid_status, 409) if the purchase is not monitoring.
        ApiError(unsupported_media_type, 415) for a bad content_type.
        ApiError(invalid_field, 400) for a disallowed corrected key, a
            receipt URL that isn't the user's own, or fields that fail
            Purchase validation.
        ApiError(receipt_missing, 400) when the uploaded blob is gone.
        ApiError(duplicate, 409) when the new receipt duplicates a
            DIFFERENT committed purchase.
    """
    purchase = await get_purchase_for_user(db, user.id, purchase_id)

    if purchase.status not in _MONITORING_STATUSES:
        raise ApiError(
            "invalid_status",
            f"Receipt can only be re-uploaded while monitoring (status '{purchase.status}')",
            status_code=409,
        )

    ingestion_source = validate_upload_content_type(content_type)
    _validate_receipt_storage_url(storage_url, user_id=user.id, bucket_name=uploader.bucket_name)

    # Recompute the receipt hash from the stored object — never trust the
    # client-carried value (forgeable to bypass dedup or poison the global
    # receipt_hash unique index against another user's receipt).
    _bucket, blob_path = _parse_gs_uri(storage_url)
    try:
        receipt_bytes, _blob_ct = await uploader.download(blob_path=blob_path)
    except ReceiptObjectMissingError as err:
        raise ApiError(
            "receipt_missing",
            "Uploaded receipt is no longer available; please re-upload.",
            status_code=400,
        ) from err
    receipt_hash = f"sha256:{hashlib.sha256(receipt_bytes).hexdigest()}"

    if corrected_fields:
        for key in corrected_fields:
            if key not in _ALLOWED_CORRECTABLE_FIELDS:
                raise ApiError(
                    "invalid_field",
                    f"Field '{key}' is not user-correctable",
                    status_code=400,
                )

    # Merge new extraction with the user's corrections (corrections win),
    # then keep only user-correctable keys — system-owned fields carried in
    # the extraction (status, currency, extraction_confidence, ...) are not
    # written through this path.
    merged: dict[str, Any] = dict(extraction) if extraction else {}
    merged.update(corrected_fields or {})
    updates: dict[str, Any] = {
        key: value for key, value in merged.items() if key in _ALLOWED_CORRECTABLE_FIELDS
    }

    # Effective values for dedup + window come from the merge, falling back
    # to the existing doc when a field wasn't touched.
    eff_platform = updates.get("platform", purchase.platform)
    eff_order_id = updates.get("order_id", purchase.order_id) or ""
    eff_member_tier = updates.get("member_tier_at_purchase", purchase.member_tier_at_purchase)
    eff_purchase_date = updates.get("purchase_date", purchase.purchase_date)

    # Exclude THIS purchase so its own committed row never false-matches.
    await _assert_not_duplicate_purchase(
        db,
        user_id=user.id,
        platform=eff_platform,
        order_id=eff_order_id,
        receipt_hash=receipt_hash,
        exclude_purchase_id=purchase_id,
    )

    # Recompute the window from the (possibly corrected) date/platform/tier.
    # fallback_default stays False: if the platform has no Policy we leave the
    # existing window untouched rather than fabricating one for an already-
    # monitored purchase.
    window_expires = await _resolve_window_expires(
        db,
        platform=eff_platform,
        purchase_date=eff_purchase_date,
        member_tier_at_purchase=eff_member_tier,
        log_ref=purchase_id,
    )

    # Receipt swap + cleared monitor-failure trail (so the UI drops any stale
    # "blocked" badge immediately, same as the BUG-19 product_url remediation).
    updates.update(
        {
            "receipt_storage_url": storage_url,
            "receipt_hash": receipt_hash,
            "ingestion_source": ingestion_source,
            "last_monitor_error": None,
            "last_monitor_error_at": None,
            "last_monitor_error_code": None,
        }
    )
    if extraction and extraction.get("extraction_confidence"):
        updates["extraction_confidence"] = extraction["extraction_confidence"]
    else:
        # Manual fill (extractor failed): the user typed/confirmed every
        # field, so treat it as fully confident.
        updates["extraction_confidence"] = {"platform": 1.0, "price": 1.0, "overall_min": 1.0}
    if window_expires is not None:
        updates["window_expires"] = window_expires

    try:
        matched = await db.partial_update("purchases", purchase_id, updates, model=Purchase)
    except ValidationError as err:
        raise ApiError(
            "invalid_field",
            "One or more fields failed validation",
            status_code=400,
            details=_validation_error_details(err),
        ) from err
    except ValueError as err:
        raise ApiError("invalid_field", str(err), status_code=400) from err
    except DuplicateKeyError as err:
        # Backstop for the global receipt_hash / order_id unique indexes —
        # the new receipt collides with a DIFFERENT committed purchase that
        # the pre-check didn't cover (e.g. a racing write).
        raise _duplicate_receipt_error() from err
    if not matched:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    updated = await db.get_purchase(purchase_id)
    if updated is None:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    _log.info(
        "Receipt re-uploaded purchase_id=%s user_id=%s manual_fill=%s",
        purchase_id,
        user.id,
        extraction is None,
    )
    return updated
