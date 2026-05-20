"""Tests for /api/v1/purchases routes (Attachment 2 §3.3).

Pattern mirrors test_routes_notifications.py: AsyncMock(spec=MongoDBClient),
dependency_overrides[get_db]/[get_current_user]/[get_receipts_uploader].
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient, Purchase, PurchaseStatus, User
from httpx import AsyncClient
from pydantic import Field, TypeAdapter, ValidationError
from src.deps import get_db, get_receipts_uploader
from src.main import app
from src.middleware.auth import get_current_user
from src.middleware.errors import ApiError
from src.routes import purchases as purchases_route
from src.services.receipts_storage import ReceiptsUploader

from ._fixtures import USER_FIXTURE

PURCHASE_ID = UUID("22222222-2222-4222-8222-222222222222")
OTHER_USER_PURCHASE_ID = UUID("33333333-3333-4333-8333-333333333333")
USER_ID = UUID("00000000-0000-0000-0000-000000000001")
OTHER_USER_ID = UUID("99999999-9999-4999-8999-999999999999")


async def _override_user() -> User:
    return User.model_validate(USER_FIXTURE)


def _purchase_fixture(
    *,
    purchase_id: UUID = PURCHASE_ID,
    user_id: UUID = USER_ID,
    status: str = "pending_confirmation",
) -> Purchase:
    now = datetime.now(UTC)
    return Purchase.model_validate(
        {
            "_id": str(purchase_id),
            "updated_at": now.isoformat(),
            "user_id": str(user_id),
            "platform": "best_buy",
            "category": "retail",
            "product_name": "Widget",
            "product_id": "W123",
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 24.99,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "currency": "USD",
            "purchase_date": now.isoformat(),
            "purchase_date_basis": "order_date",
            "window_expires": now.isoformat(),
            "order_id": "A123",
            "member_tier_at_purchase": None,
            "status": status,
            "claim_type": "self_service",
            "monitoring_cadence_minutes": 360,
            "ingested_at": now.isoformat(),
            "ingestion_source": "gmail",
            "receipt_storage_url": None,
            "receipt_hash": "sha256:abc123",
            "extraction_confidence": {
                "platform": 0.94,
                "price": 0.94,
                "overall_min": 0.94,
            },
        }
    )


def _set_overrides(db: AsyncMock, uploader: AsyncMock | None = None) -> None:
    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    if uploader is not None:

        async def _override_uploader() -> ReceiptsUploader:
            return uploader

        app.dependency_overrides[get_receipts_uploader] = _override_uploader


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_receipts_uploader, None)


# ---------------------------------------------------------------------------
# GET /purchases — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_purchases_returns_page(client: AsyncClient) -> None:
    purchase_a = _purchase_fixture(purchase_id=UUID("11111111-1111-4111-8111-111111111111"))
    purchase_b = _purchase_fixture(purchase_id=PURCHASE_ID)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=2)
    mock_db.find_many = AsyncMock(return_value=[purchase_a, purchase_b])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["total_count"] == 2
        assert payload["next_cursor"] is None
        assert len(payload["purchases"]) == 2

        count_filter = mock_db.count.await_args.args[1]
        assert count_filter == {"user_id": USER_ID}
        find_filter = mock_db.find_many.await_args.args[1]
        assert find_filter == {"user_id": USER_ID}
        assert mock_db.find_many.await_args.kwargs["sort"] == [("_id", 1)]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_applies_filters(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?status=monitoring&category=retail&limit=5",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200

        count_filter = mock_db.count.await_args.args[1]
        assert count_filter == {
            "user_id": USER_ID,
            "status": "monitoring",
            "category": "retail",
        }
        # find_many uses limit + 1 to detect has_more
        assert mock_db.find_many.await_args.kwargs["limit"] == 6
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_emits_next_cursor_when_has_more(client: AsyncClient) -> None:
    # Service requests limit+1 docs; if all limit+1 come back, has_more=True.
    docs = [
        _purchase_fixture(purchase_id=UUID(f"{i:08d}-0000-4000-8000-000000000000"))
        for i in range(1, 4)
    ]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=3)
    mock_db.find_many = AsyncMock(return_value=docs)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?limit=2",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["purchases"]) == 2
        assert payload["next_cursor"] is not None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_invalid_cursor(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?cursor=not-a-real-cursor",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_cursor"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_cursor_roundtrip(client: AsyncClient) -> None:
    """A cursor produced by the server must be accepted on the next request."""
    docs = [
        _purchase_fixture(purchase_id=UUID(f"{i:08d}-0000-4000-8000-000000000000"))
        for i in range(1, 4)
    ]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=3)
    mock_db.find_many = AsyncMock(return_value=docs)
    _set_overrides(mock_db)
    try:
        first = await client.get(
            "/api/v1/purchases?limit=2",
            headers={"Authorization": "Bearer valid-token"},
        )
        cursor = first.json()["next_cursor"]
        assert cursor

        second = await client.get(
            f"/api/v1/purchases?limit=2&cursor={cursor}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert second.status_code == 200
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# GET /purchases/{id} — detail
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_purchase_returns_owned_purchase(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status="monitoring"))
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["purchase"]["_id"] == str(PURCHASE_ID)
        assert payload["purchase"]["status"] == "monitoring"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_404_when_missing(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_404_when_owned_by_other_user(client: AsyncClient) -> None:
    """Cross-user access must 404 (never 403) so existence cannot be probed."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(
        return_value=_purchase_fixture(
            purchase_id=OTHER_USER_PURCHASE_ID,
            user_id=OTHER_USER_ID,
        )
    )
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{OTHER_USER_PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_invalid_uuid(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases/not-a-uuid",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_purchase_id"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/{id}/confirm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_confirm_purchase_sets_monitoring(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    # get_purchase: 1st call for ownership check, 2nd for the post-update read.
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["purchase"]["status"] == PurchaseStatus.MONITORING
        update_args = mock_db.partial_update.await_args
        assert update_args.args[2]["status"] == PurchaseStatus.MONITORING
        assert "_id" not in update_args.args[2]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_with_corrected_fields(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "corrected_fields": {
                    "product_name": "Corrected Widget",
                    "price_paid": 19.99,
                }
            },
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["product_name"] == "Corrected Widget"
        assert updates["price_paid"] == 19.99
        assert updates["status"] == PurchaseStatus.MONITORING
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_rejects_disallowed_field(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"user_id": str(OTHER_USER_ID)}},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_field"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_invalid_corrected_value_returns_400(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    mock_db.partial_update = AsyncMock(side_effect=_positive_float_validation_error())
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"price_paid": -1}},
        )
        assert response.status_code == 400
        payload = response.json()
        assert payload["error"]["code"] == "invalid_field"
        assert payload["error"]["details"]["fields"][0]["type"] == "greater_than"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_rejects_wrong_status(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status="monitoring"))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 409
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_cross_user_404(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(user_id=OTHER_USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/{id}/dismiss
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dismiss_duplicate_does_not_write_skiplist(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "duplicate", "remember_sender": True, "sender": "x@y.z"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["status"] == PurchaseStatus.DISMISSED
        assert payload["reason"] == "duplicate"
        # Skiplist only applies to not_an_order / other, never duplicate.
        assert payload["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_not_an_order_with_remember_sender_writes_skiplist(
    client: AsyncClient,
) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
                "sender": "promo@retailer.example",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["skiplist_written"] is True
        mock_db.upsert.assert_awaited_once()
        upserted_user = mock_db.upsert.await_args.args[2]
        assert len(upserted_user.ingestion_skiplist) == 1
        entry = upserted_user.ingestion_skiplist[0]
        assert entry.sender == "promo@retailer.example"
        assert entry.format_hash == "sha256:abc123"
        assert entry.reason == "not_an_order"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_not_an_order_without_remember_sender_skips_skiplist(
    client: AsyncClient,
) -> None:
    """remember_sender defaults to False; skiplist must not be written."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock()
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order", "sender": "promo@retailer.example"},
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_other_reason_with_remember_sender_writes_skiplist(
    client: AsyncClient,
) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "other", "remember_sender": True, "sender": "x@y.z"},
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is True
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_skiplist_failure_is_best_effort(client: AsyncClient) -> None:
    """When db.upsert fails during skiplist write, dismiss still 200s."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(side_effect=RuntimeError("simulated"))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
                "sender": "promo@retailer.example",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == PurchaseStatus.DISMISSED
        assert payload["skiplist_written"] is False
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_rejects_unknown_reason(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "made_up_reason"},
        )
        assert response.status_code == 422
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/upload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_pdf_creates_pending_purchase(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.upsert = AsyncMock(return_value="00000000-0000-4000-8000-000000000000")
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.upload = AsyncMock(return_value="gs://test-bucket/receipts/x.pdf")
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("receipt.pdf", b"%PDF-1.4 test content", "application/pdf")},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["purchase"]["status"] == "pending_confirmation"
        assert payload["purchase"]["ingestion_source"] == "upload_pdf"
        assert payload["purchase"]["receipt_storage_url"] == "gs://test-bucket/receipts/x.pdf"
        assert mock_uploader.upload.await_count == 1
        assert mock_db.upsert.await_count == 1
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_upload_jpeg_sets_image_ingestion_source(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.upsert = AsyncMock(return_value="00000000-0000-4000-8000-000000000000")
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.upload = AsyncMock(return_value="gs://test/x.jpg")
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("r.jpg", b"\xff\xd8\xff\xe0jpeg", "image/jpeg")},
        )
        assert response.status_code == 200
        assert response.json()["purchase"]["ingestion_source"] == "upload_image"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_content_type(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("r.txt", b"hello", "text/plain")},
        )
        assert response.status_code == 415
        assert response.json()["error"]["code"] == "unsupported_media_type"
        mock_uploader.upload.assert_not_awaited()
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_upload_rejects_file_larger_than_10mb(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    _set_overrides(mock_db, mock_uploader)
    try:
        oversize = b"x" * (10 * 1024 * 1024 + 1)
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("big.pdf", oversize, "application/pdf")},
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "file_too_large"
        mock_uploader.upload.assert_not_awaited()
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_limited_upload_reader_stops_after_size_limit() -> None:
    upload = _InfiniteChunkUpload(chunk_size=64 * 1024)

    with pytest.raises(ApiError) as exc_info:
        await purchases_route._read_limited_upload(upload)

    assert exc_info.value.code == "file_too_large"
    assert upload.read_calls == 161


def _positive_float_validation_error() -> ValidationError:
    try:
        TypeAdapter(Annotated[float, Field(gt=0)]).validate_python(-1)
    except ValidationError as exc:
        return exc
    raise AssertionError("expected validation error")


class _InfiniteChunkUpload:
    def __init__(self, *, chunk_size: int) -> None:
        self._chunk = b"x" * chunk_size
        self.read_calls = 0

    async def read(self, size: int) -> bytes:
        self.read_calls += 1
        assert size == purchases_route._UPLOAD_READ_CHUNK_BYTES
        return self._chunk
