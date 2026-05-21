"""Tests for the /pubsub/purchase.uploaded handler (ticket 5.14).

OIDC verification is bypassed via PUBSUB_AUTH_DISABLED=1 (same pattern as
test_pubsub_handler.py); the auth path itself is exercised once in the
existing gmail-inbound test file and works the same way here because both
handlers depend on the shared `verify_pubsub_oidc`.
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import (
    MongoDBClient,
    Policy,
    PurchaseReadTolerant,
)
from fastapi.testclient import TestClient
from src import main as main_module
from src.extractor import ExtractedPurchaseFields, ExtractorError
from src.finalize import FinalizeError
from src.main import app, get_db, get_receipts_reader
from src.storage import ReceiptObjectMissingError, ReceiptsReader

PURCHASE_ID = UUID("22222222-2222-4222-8222-222222222222")
USER_ID = UUID("11111111-1111-4111-8111-111111111111")


# ---------- _select_mime_type unit tests --------------------------------
# Direct coverage of the helper so the priority chain is documented
# field-level, independent of FastAPI plumbing. The end-to-end handler
# tests below assert the same chain through the public Pub/Sub surface.


class TestSelectMimeType:
    def test_uses_gcs_when_known(self) -> None:
        assert (
            main_module._select_mime_type(
                blob_content_type="image/png",
                event_content_type="application/pdf",
                data=b"\x89PNG\r\n",
                purchase_id=PURCHASE_ID,
            )
            == "image/png"
        )

    def test_strips_parameters_from_gcs_value(self) -> None:
        # `image/jpeg; charset=binary` should still route to image/jpeg.
        assert (
            main_module._select_mime_type(
                blob_content_type="image/jpeg; charset=binary",
                event_content_type="application/octet-stream",
                data=b"\xff\xd8\xff\xe0",
                purchase_id=PURCHASE_ID,
            )
            == "image/jpeg"
        )

    def test_falls_back_to_event_when_gcs_octet_stream(self) -> None:
        assert (
            main_module._select_mime_type(
                blob_content_type="application/octet-stream",
                event_content_type="application/pdf",
                data=b"%PDF-1.4",
                purchase_id=PURCHASE_ID,
            )
            == "application/pdf"
        )

    def test_falls_back_to_event_when_gcs_missing(self) -> None:
        assert (
            main_module._select_mime_type(
                blob_content_type=None,
                event_content_type="image/png",
                data=b"\x89PNG\r\n",
                purchase_id=PURCHASE_ID,
            )
            == "image/png"
        )

    def test_sniffs_pdf_when_both_unknown(self) -> None:
        assert (
            main_module._select_mime_type(
                blob_content_type="application/octet-stream",
                event_content_type="application/octet-stream",
                data=b"%PDF-1.7 leading bytes",
                purchase_id=PURCHASE_ID,
            )
            == "application/pdf"
        )

    def test_sniffs_jpeg_when_both_unknown(self) -> None:
        assert (
            main_module._select_mime_type(
                blob_content_type=None,
                event_content_type=None,
                data=b"\xff\xd8\xff\xe0jpeg-bytes",
                purchase_id=PURCHASE_ID,
            )
            == "image/jpeg"
        )

    def test_sniffs_png_when_both_unknown(self) -> None:
        assert (
            main_module._select_mime_type(
                blob_content_type="application/octet-stream",
                event_content_type=None,
                data=b"\x89PNG\r\n\x1a\nthe-rest",
                purchase_id=PURCHASE_ID,
            )
            == "image/png"
        )

    def test_returns_octet_stream_when_nothing_matches(self) -> None:
        # `extract_from_blob` will then ValueError — that's the right
        # surface (`extractor_rejected_input`, ack + log) for genuinely
        # unrecognised bytes.
        assert (
            main_module._select_mime_type(
                blob_content_type=None,
                event_content_type="application/octet-stream",
                data=b"random unrecognised payload",
                purchase_id=PURCHASE_ID,
            )
            == "application/octet-stream"
        )


@pytest.fixture(autouse=True)
def _disable_oidc(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUBSUB_AUTH_DISABLED", "1")


def _encode_event(payload: dict[str, str]) -> str:
    return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def _envelope(data: str, message_id: str = "msg-1") -> dict[str, object]:
    return {
        "message": {
            "data": data,
            "messageId": message_id,
            "publishTime": "2026-05-21T00:00:00Z",
            "attributes": {},
        },
        "subscription": "projects/test-project/subscriptions/purchase.uploaded-ingest-agent-sub",
    }


def _event_payload(
    *,
    purchase_id: UUID = PURCHASE_ID,
    user_id: UUID = USER_ID,
    receipt_storage_url: str = "gs://test-bucket/receipts/u/p/x.pdf",
    content_type: str = "application/pdf",
) -> dict[str, str]:
    return {
        "purchase_id": str(purchase_id),
        "user_id": str(user_id),
        "receipt_storage_url": receipt_storage_url,
        "content_type": content_type,
    }


def _purchase_doc(
    *,
    purchase_id: UUID = PURCHASE_ID,
    user_id: UUID = USER_ID,
    status: str = "pending_confirmation",
    receipt_storage_url: str = "gs://test-bucket/receipts/u/p/x.pdf",
) -> PurchaseReadTolerant:
    now = datetime.now(UTC)
    return PurchaseReadTolerant.model_validate(
        {
            "_id": str(purchase_id),
            "updated_at": now.isoformat(),
            "user_id": str(user_id),
            "platform": "best_buy",
            "category": "retail",
            "product_name": "",
            "product_id": "",
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 0.01,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "currency": "USD",
            "purchase_date": now.isoformat(),
            "purchase_date_basis": "order_date",
            "window_expires": now.isoformat(),
            "order_id": "",
            "member_tier_at_purchase": None,
            "status": status,
            "claim_type": "self_service",
            "monitoring_cadence_minutes": 360,
            "ingested_at": now.isoformat(),
            "ingestion_source": "upload_pdf",
            "receipt_storage_url": receipt_storage_url,
            "receipt_hash": "sha256:sentinel",
            "format_hash": "sha256:sentinel",
            "sender": "upload@user.local",
            "extraction_confidence": {
                "platform": 0.0,
                "price": 0.0,
                "overall_min": 0.0,
            },
        }
    )


def _extracted() -> ExtractedPurchaseFields:
    return ExtractedPurchaseFields.model_validate(
        {
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
            "purchase_date": "2026-05-04T18:22:31Z",
            "purchase_date_basis": "order_date",
            "order_id": "A123",
            "member_tier_at_purchase": None,
            "extraction_confidence": {
                "platform": 0.99,
                "price": 0.98,
                "overall_min": 0.98,
                "order_id": 0.99,
                "product_name": 0.97,
                "product_id": 0.96,
                "price_paid": 0.98,
                "purchase_date": 0.95,
                "category": 0.98,
            },
        }
    )


def _policy() -> Policy:
    return Policy.model_validate(
        {
            "_id": "00000000-0000-4000-8000-000000000abc",
            "updated_at": datetime.now(UTC).isoformat(),
            "platform": "best_buy",
            "category": "retail",
            "window_days": 15,
            "window_days_member": None,
            "pre_arrival_hours_required": None,
            "covers_own_drops": True,
            "covers_competitor_drops": False,
            "claim_type": "self_service",
            "claim_url": "https://example.com",
            "claim_email": None,
            "claim_phone": None,
            "loyalty_required": False,
            "award_ticket_eligible": None,
            "bundle_exclusions": False,
            "key_exclusions": [],
            "policy_url": "https://example.com",
            "policy_text_full": "f",
            "policy_text_relevant_clause": "c",
            "last_verified": datetime.now(UTC).isoformat(),
            "active": True,
        }
    )


def _setup_overrides(
    *,
    purchase: PurchaseReadTolerant | None,
    policy: Policy | None = None,
    blob: tuple[bytes, str] | None = (b"%PDF-1.4 fake", "application/pdf"),
    blob_error: Exception | None = None,
) -> tuple[AsyncMock, AsyncMock]:
    db = AsyncMock(spec=MongoDBClient)
    # First call is the idempotency check, second (inside finalize) is
    # the ownership-load, third is the post-update refresh.
    db.get_purchase = AsyncMock(side_effect=[purchase, purchase, purchase])
    db.get_policy = AsyncMock(return_value=policy or _policy())
    db.partial_update = AsyncMock(return_value=True)
    db.find_one = AsyncMock(return_value=None)
    db.upsert_notification_event = AsyncMock(return_value="event-id")

    reader = AsyncMock(spec=ReceiptsReader)
    reader.bucket_name = "test-bucket"
    if blob_error is not None:
        reader.download = AsyncMock(side_effect=blob_error)
    else:
        reader.download = AsyncMock(return_value=blob)

    async def _override_db() -> MongoDBClient:
        return db

    async def _override_reader() -> ReceiptsReader:
        return reader

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_receipts_reader] = _override_reader
    return db, reader


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_receipts_reader, None)


@pytest.fixture
def patch_extractor(monkeypatch: pytest.MonkeyPatch):
    """Default extractor + publisher patches so the happy-path is one line."""

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        return _extracted()

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    monkeypatch.setattr(
        "src.finalize.publish_event",
        AsyncMock(return_value="msg-finalize"),
    )
    yield


def test_handler_happy_path_extracts_and_finalizes(patch_extractor) -> None:
    _, reader = _setup_overrides(purchase=_purchase_doc())
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json() == {"status": "ack"}
        reader.download.assert_awaited_once_with(blob_path="receipts/u/p/x.pdf")
    finally:
        _clear_overrides()


def test_handler_returns_200_for_invalid_envelope() -> None:
    _setup_overrides(purchase=_purchase_doc())
    try:
        with TestClient(app) as client:
            resp = client.post("/pubsub/purchase.uploaded", json={"not_envelope": True})
        assert resp.status_code == 200
        assert resp.json()["reason"] == "invalid_envelope"
    finally:
        _clear_overrides()


def test_handler_returns_200_for_invalid_base64() -> None:
    _setup_overrides(purchase=_purchase_doc())
    try:
        with TestClient(app) as client:
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope("!!!not-base64!!!"))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "invalid_base64"
    finally:
        _clear_overrides()


def test_handler_returns_200_for_invalid_payload_shape() -> None:
    _setup_overrides(purchase=_purchase_doc())
    try:
        with TestClient(app) as client:
            data = _encode_event({"missing": "fields"})  # type: ignore[arg-type]
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "invalid_payload"
    finally:
        _clear_overrides()


def test_handler_returns_200_for_invalid_purchase_id() -> None:
    _setup_overrides(purchase=_purchase_doc())
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload() | {"purchase_id": "not-a-uuid"})
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "invalid_purchase_id"
    finally:
        _clear_overrides()


def test_handler_returns_200_when_purchase_missing(patch_extractor) -> None:
    _setup_overrides(purchase=None)
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "purchase_not_found"
    finally:
        _clear_overrides()


def test_handler_acks_already_processed_purchase(patch_extractor) -> None:
    """Idempotency: a redelivery (or post-confirm race) returns 200 quietly."""
    _, reader = _setup_overrides(purchase=_purchase_doc(status="monitoring"))
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ack"
        assert body["reason"] == "already_processed"
        # Defence in depth: must not touch GCS or Gemini for a doc we're
        # idempotently skipping.
        reader.download.assert_not_awaited()
    finally:
        _clear_overrides()


def test_handler_returns_200_when_receipt_url_missing(patch_extractor) -> None:
    purchase = _purchase_doc()
    # Force receipt_storage_url to None via model_copy + null event url.
    purchase = purchase.model_copy(update={"receipt_storage_url": None})
    _, reader = _setup_overrides(purchase=purchase)
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload(receipt_storage_url=""))
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "no_receipt_url"
        reader.download.assert_not_awaited()
    finally:
        _clear_overrides()


def test_handler_rejects_bucket_mismatch(patch_extractor) -> None:
    purchase = _purchase_doc(receipt_storage_url="gs://other-bucket/some/object.pdf")
    _, reader = _setup_overrides(purchase=purchase)
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "bucket_mismatch"
        reader.download.assert_not_awaited()
    finally:
        _clear_overrides()


def test_handler_returns_200_when_blob_missing(patch_extractor) -> None:
    _setup_overrides(
        purchase=_purchase_doc(),
        blob_error=ReceiptObjectMissingError("missing"),
    )
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "receipt_blob_missing"
    finally:
        _clear_overrides()


def test_handler_returns_200_when_extractor_rejects_input(monkeypatch: pytest.MonkeyPatch) -> None:
    _setup_overrides(purchase=_purchase_doc())

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        raise ValueError("Unsupported blob mime_type")

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)

    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "extractor_rejected_input"
    finally:
        _clear_overrides()


def test_handler_returns_200_when_extractor_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    _setup_overrides(purchase=_purchase_doc())

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        raise ExtractorError("Gemini timed out")

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)

    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "extractor_failed"
    finally:
        _clear_overrides()


def test_handler_returns_200_when_finalize_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _setup_overrides(purchase=_purchase_doc())

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        return _extracted()

    async def fake_finalize(**_kwargs) -> object:
        raise FinalizeError("vanished mid-write")

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    monkeypatch.setattr(main_module, "finalize_purchase_extraction", fake_finalize)

    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload())
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "finalize_failed"
    finally:
        _clear_overrides()


def test_handler_prefers_gcs_content_type_over_event_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If GCS-reported content_type differs from event payload, GCS wins.

    Rationale: the bytes that GCS actually serves are the bytes we're
    extracting; a future api-gateway change that drifts the event
    content-type shouldn't make us mis-call Gemini with the wrong
    multimodal mime.
    """
    captured: dict[str, object] = {}

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        captured["mime_type"] = mime_type
        return _extracted()

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    monkeypatch.setattr("src.finalize.publish_event", AsyncMock(return_value="msg-finalize"))

    # GCS reports image/png; event payload incorrectly says application/pdf.
    _setup_overrides(
        purchase=_purchase_doc(),
        blob=(b"\x89PNG\r\n", "image/png"),
    )
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload(content_type="application/pdf"))
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert captured["mime_type"] == "image/png"
    finally:
        _clear_overrides()


def test_handler_falls_back_to_event_content_type_when_gcs_octet_stream(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GCS metadata "application/octet-stream" must NOT drop the message.

    `ReceiptsReader.download()` defaults to "application/octet-stream"
    when blob metadata is missing, which would otherwise dominate the
    `blob_content_type or payload.content_type` fallback and make
    `extract_from_blob` reject the input. The handler now treats
    octet-stream as "unknown" and falls through to the
    upload-validated payload content_type.
    """
    captured: dict[str, object] = {}

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        captured["mime_type"] = mime_type
        return _extracted()

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    monkeypatch.setattr("src.finalize.publish_event", AsyncMock(return_value="msg-finalize"))

    _setup_overrides(
        purchase=_purchase_doc(),
        blob=(b"%PDF-1.4 fake", "application/octet-stream"),
    )
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload(content_type="application/pdf"))
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert captured["mime_type"] == "application/pdf"
    finally:
        _clear_overrides()


def test_handler_sniffs_mime_when_both_metadata_sources_unknown(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Both metadata sources unusable → magic-byte sniff carries the message.

    Last-resort fallback so a metadata-corruption regression in either
    GCS or the upload event doesn't permanently drop otherwise valid
    PDF/JPEG uploads. Also asserts the WARNING is emitted so this path
    is visible in logs.
    """
    captured: dict[str, object] = {}

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        captured["mime_type"] = mime_type
        return _extracted()

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    monkeypatch.setattr("src.finalize.publish_event", AsyncMock(return_value="msg-finalize"))

    _setup_overrides(
        purchase=_purchase_doc(),
        blob=(b"\xff\xd8\xff\xe0and-then-some-jpeg-bytes", "application/octet-stream"),
    )
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload(content_type="application/octet-stream"))
            with caplog.at_level("WARNING", logger="src.main"):
                resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert captured["mime_type"] == "image/jpeg"
        assert any("magic-byte sniff" in r.message for r in caplog.records)
    finally:
        _clear_overrides()


def test_handler_returns_extractor_rejected_when_all_signals_fail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unknown blob bytes + unknown metadata → handler logs + acks.

    With the new content-type selection we still want to land in
    `extractor_rejected_input` (rather than 5xx-loop) when bytes really
    don't match any allowed format. Asserts the priority chain bottoms
    out at the existing rejection path.
    """

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        if mime_type == "application/octet-stream":
            raise ValueError("Unsupported blob mime_type")
        return _extracted()

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)

    _setup_overrides(
        purchase=_purchase_doc(),
        blob=(b"random unrecognised bytes", "application/octet-stream"),
    )
    try:
        with TestClient(app) as client:
            data = _encode_event(_event_payload(content_type="application/octet-stream"))
            resp = client.post("/pubsub/purchase.uploaded", json=_envelope(data))
        assert resp.status_code == 200
        assert resp.json()["reason"] == "extractor_rejected_input"
    finally:
        _clear_overrides()
