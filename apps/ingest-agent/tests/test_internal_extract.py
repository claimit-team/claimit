"""Tests for the synchronous POST /internal/extract endpoint.

The write-after-confirm upload flow: api-gateway uploads the blob to GCS
then calls this endpoint to get fields back. OIDC is bypassed via
INTERNAL_AUTH_DISABLED=1 (the verifier itself is covered in
test_ingest_auth.py). The endpoint reads the blob via ReceiptsReader and
runs extract_from_blob — both are monkeypatched here so no GCS / Gemini.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from src import main as main_module
from src.extractor import ExtractedPurchaseFields, ExtractorError
from src.main import app, get_receipts_reader
from src.storage import ReceiptObjectMissingError, ReceiptsReader

_STORAGE_URL = "gs://test-bucket/receipts/u/p/x.pdf"
_USER_ID = "11111111-1111-4111-8111-111111111111"


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
                "price_paid": 0.98,
                "purchase_date": 0.95,
                "category": 0.98,
            },
        }
    )


def _extracted_multi() -> ExtractedPurchaseFields:
    """A multi-item receipt: top-level fields = highest-priced line, plus a
    populated `line_items` array (one entry per distinct line)."""
    return ExtractedPurchaseFields.model_validate(
        {
            "platform": "best_buy",
            "category": "retail",
            "product_name": "Laptop",  # highest-priced (top-level)
            "product_id": "L999",
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 999.0,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "purchase_date": "2026-05-04T18:22:31Z",
            "purchase_date_basis": "order_date",
            "order_id": "ORDER-7",
            "member_tier_at_purchase": None,
            "line_items_detected": 2,
            "line_items": [
                {
                    "product_name": "Laptop",
                    "product_id": "L999",
                    "product_url": None,
                    "variant": "16GB",
                    "price_paid": 999.0,
                    "confidence": {"product_name": 0.97, "price_paid": 0.96},
                },
                {
                    "product_name": "Mouse",
                    "product_id": "M111",
                    "product_url": None,
                    "variant": None,
                    "price_paid": 29.0,
                    "confidence": {"product_name": 0.95, "price_paid": 0.94},
                },
            ],
            "extraction_confidence": {
                "platform": 0.99,
                "price": 0.4,  # top-level capped for multi-item
                "overall_min": 0.4,
                "order_id": 0.99,
                "product_name": 0.97,
                "price_paid": 0.4,
                "purchase_date": 0.95,
                "category": 0.98,
            },
        }
    )


def _override_reader(*, blob_error: Exception | None = None) -> AsyncMock:
    reader = AsyncMock(spec=ReceiptsReader)
    reader.bucket_name = "test-bucket"
    if blob_error is not None:
        reader.download = AsyncMock(side_effect=blob_error)
    else:
        reader.download = AsyncMock(return_value=(b"%PDF-1.4 fake", "application/pdf"))

    async def _get() -> ReceiptsReader:
        return reader

    app.dependency_overrides[get_receipts_reader] = _get
    return reader


def _clear() -> None:
    app.dependency_overrides.pop(get_receipts_reader, None)


@pytest.fixture(autouse=True)
def _disable_oidc(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_AUTH_DISABLED", "1")


def _post() -> object:
    with TestClient(app) as client:
        return client.post(
            "/internal/extract",
            json={
                "user_id": _USER_ID,
                "storage_url": _STORAGE_URL,
                "content_type": "application/pdf",
            },
        )


def test_extract_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    _override_reader()

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        return _extracted()

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    try:
        response = _post()
        assert response.status_code == 200, response.text
        extraction = response.json()["extraction"]
        assert extraction["product_name"] == "Widget"
        assert extraction["status"] in {"monitoring", "pending_confirmation", "pending_user_edit"}
        assert extraction["currency"] == "USD"
        assert "extraction_confidence" in extraction
        # Transient extractor-only field must not leak onto the wire.
        assert "line_items_detected" not in extraction
        # Single-item receipt → no per-line breakdown.
        assert extraction["line_items"] == []
    finally:
        _clear()


def test_extract_multi_item_returns_per_line_payloads(monkeypatch: pytest.MonkeyPatch) -> None:
    _override_reader()

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        return _extracted_multi()

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    try:
        response = _post()
        assert response.status_code == 200, response.text
        extraction = response.json()["extraction"]

        # Top-level stays the highest-priced item (backward compat).
        assert extraction["product_name"] == "Laptop"

        lines = extraction["line_items"]
        assert len(lines) == 2
        assert [line["receipt_line_key"] for line in lines] == ["line-0", "line-1"]

        # Each line carries its own product + price and the shared receipt
        # fields (order_id / platform / purchase_date) merged in.
        by_name = {line["product_name"]: line for line in lines}
        assert set(by_name) == {"Laptop", "Mouse"}
        mouse = by_name["Mouse"]
        assert mouse["price_paid"] == 29.0
        assert mouse["product_id"] == "M111"
        assert mouse["order_id"] == "ORDER-7"
        assert mouse["platform"] == "best_buy"
        assert mouse["purchase_date"] == "2026-05-04T18:22:31Z"
        assert mouse["currency"] == "USD"

        # Per-line price confidence is the line's own — NOT the 0.4
        # multi-item cap applied to the ambiguous top-level price.
        assert mouse["extraction_confidence"]["price_paid"] == 0.94
        assert mouse["extraction_confidence"]["price"] == 0.94
    finally:
        _clear()


def test_extract_rejects_bad_input_422(monkeypatch: pytest.MonkeyPatch) -> None:
    _override_reader()

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        raise ValueError("unsupported mime")

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    try:
        response = _post()
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "extractor_rejected_input"
    finally:
        _clear()


def test_extract_extractor_failure_502(monkeypatch: pytest.MonkeyPatch) -> None:
    _override_reader()

    async def fake_extract(*, data: bytes, mime_type: str) -> ExtractedPurchaseFields:
        raise ExtractorError("gemini timeout")

    monkeypatch.setattr(main_module, "extract_from_blob", fake_extract)
    try:
        response = _post()
        assert response.status_code == 502
        assert response.json()["detail"]["code"] == "extractor_failed"
    finally:
        _clear()


def test_extract_bucket_mismatch_403() -> None:
    _override_reader()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/internal/extract",
                json={
                    "user_id": _USER_ID,
                    "storage_url": "gs://other-bucket/receipts/u/p/x.pdf",
                    "content_type": "application/pdf",
                },
            )
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "bucket_mismatch"
    finally:
        _clear()


def test_extract_malformed_url_400() -> None:
    _override_reader()
    try:
        with TestClient(app) as client:
            response = client.post(
                "/internal/extract",
                json={
                    "user_id": _USER_ID,
                    "storage_url": "not-a-gs-uri",
                    "content_type": "application/pdf",
                },
            )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "malformed_receipt_url"
    finally:
        _clear()


def test_extract_blob_missing_502() -> None:
    _override_reader(blob_error=ReceiptObjectMissingError("gone"))
    try:
        response = _post()
        assert response.status_code == 502
        assert response.json()["detail"]["code"] == "receipt_blob_missing"
    finally:
        _clear()
