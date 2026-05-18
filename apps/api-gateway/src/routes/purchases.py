"""Purchase confirmation and dismissal endpoints (ticket 3.6)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from claimit_mongodb_models import (
    IngestionSkiplistEntry,
    MongoDBClient,
    Purchase,
    PurchaseStatus,
    User,
)
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/purchases", tags=["purchases"])

DismissReason = Literal["not_an_order", "duplicate"]


class DismissPurchaseRequest(BaseModel):
    reason: DismissReason
    sender: str | None = Field(
        default=None,
        min_length=1,
        description="Original email sender for skiplist (required for not_an_order when known).",
    )


def _parse_purchase_id(purchase_id: str) -> UUID:
    try:
        return UUID(purchase_id)
    except ValueError as err:
        raise ApiError("invalid_purchase_id", "Invalid purchase id", status_code=400) from err


async def _get_user_purchase(
    purchase_id: UUID,
    user: User,
    db: MongoDBClient,
) -> Purchase:
    purchase = await db.get_purchase(purchase_id)
    if purchase is None:
        raise ApiError("not_found", "Purchase not found", status_code=404)
    if purchase.user_id != user.id:
        raise ApiError("not_found", "Purchase not found", status_code=404)
    return purchase


@router.post("/{purchase_id}/confirm")
async def confirm_purchase(
    purchase_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Confirm a low-confidence extraction and start monitoring."""
    uid = _parse_purchase_id(purchase_id)
    purchase = await _get_user_purchase(uid, user, db)

    if purchase.status != PurchaseStatus.PENDING_CONFIRMATION:
        raise ApiError(
            "invalid_status",
            f"Purchase cannot be confirmed from status '{purchase.status}'",
            status_code=409,
        )

    updated = await db.partial_update(
        "purchases",
        uid,
        {"status": PurchaseStatus.MONITORING},
        model=Purchase,
    )
    if not updated:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    _log.info("Purchase confirmed purchase_id=%s user_id=%s", uid, user.id)
    return {"purchase_id": str(uid), "status": PurchaseStatus.MONITORING}


@router.post("/{purchase_id}/dismiss")
async def dismiss_purchase(
    purchase_id: str,
    body: DismissPurchaseRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Dismiss a pending confirmation (not an order or duplicate)."""
    uid = _parse_purchase_id(purchase_id)
    purchase = await _get_user_purchase(uid, user, db)

    if purchase.status != PurchaseStatus.PENDING_CONFIRMATION:
        raise ApiError(
            "invalid_status",
            f"Purchase cannot be dismissed from status '{purchase.status}'",
            status_code=409,
        )

    updated = await db.partial_update(
        "purchases",
        uid,
        {"status": PurchaseStatus.DISMISSED},
        model=Purchase,
    )
    if not updated:
        raise ApiError("not_found", "Purchase not found", status_code=404)

    skiplist_written = False
    if body.reason == "not_an_order":
        try:
            skiplist_written = await _append_ingestion_skiplist(user, purchase, body, db)
        except Exception:
            _log.exception(
                "Skiplist write failed (best-effort) purchase_id=%s user_id=%s",
                uid,
                user.id,
            )

    _log.info(
        "Purchase dismissed purchase_id=%s user_id=%s reason=%s skiplist=%s",
        uid,
        user.id,
        body.reason,
        skiplist_written,
    )
    return {
        "purchase_id": str(uid),
        "status": PurchaseStatus.DISMISSED,
        "reason": body.reason,
        "skiplist_written": skiplist_written,
    }


async def _append_ingestion_skiplist(
    user: User,
    purchase: Purchase,
    body: DismissPurchaseRequest,
    db: MongoDBClient,
) -> bool:
    """Append a skiplist entry for ticket 3.7 prep (filtering applied in 3.7)."""
    format_hash = purchase.receipt_hash or ""
    if not format_hash:
        _log.warning(
            "Dismiss not_an_order without receipt_hash; skiplist entry may be weak purchase_id=%s",
            purchase.id,
        )

    sender = (body.sender or "").strip() or "unknown"
    now = datetime.now(UTC)
    entry = IngestionSkiplistEntry(
        sender=sender,
        format_hash=format_hash,
        added_at=now,
        reason="not_an_order",
    )

    existing = user.ingestion_skiplist
    if any(e.sender == entry.sender and e.format_hash == entry.format_hash for e in existing):
        return False

    updated_skiplist = [*existing, entry]
    user.ingestion_skiplist = updated_skiplist
    user.updated_at = now
    await db.upsert("users", user.id, user)
    return True
