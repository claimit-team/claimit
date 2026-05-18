"""Tests for receipt content hashing and deduplication."""

from __future__ import annotations

import asyncio
import logging
import re
from unittest.mock import AsyncMock

import pytest
from src.dedup import DuplicateReceiptError, check_duplicate, hash_receipt

SHA256_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")

SAMPLE_BODY = (
    "Order #A123\n"
    "Widget SKU W123\n"
    "Total $24.99\n"
    "Message-ID: <abc123@mail.example.com>\n"
    "Date: Mon, 4 May 2026 18:22:31 +0000\n"
)


def test_same_email_twice_produces_same_hash() -> None:
    """Core acceptance criterion: same email twice = same hash."""
    first = hash_receipt(SAMPLE_BODY)
    second = hash_receipt(SAMPLE_BODY)
    assert first == second


def test_hash_output_format() -> None:
    result = hash_receipt(SAMPLE_BODY)
    assert SHA256_PATTERN.match(result)


def test_normalization_whitespace_and_casing() -> None:
    variant = (
        "  ORDER   #A123\n"
        "widget sku w123\n"
        "TOTAL $24.99\n"
        "message-id: <abc123@mail.example.com>\n"
        "date: mon, 4 may 2026 18:22:31 +0000\n"
    )
    assert hash_receipt(SAMPLE_BODY) == hash_receipt(variant)


def test_normalization_strips_iso_timestamps() -> None:
    base = "Order #A123. Widget SKU W123. Total $24.99."
    iso_variant_a = f"{base} Shipped 2026-05-04T18:22:31Z."
    iso_variant_b = f"{base} Shipped 2026-05-05T09:15:00+00:00."
    assert hash_receipt(iso_variant_a) == hash_receipt(iso_variant_b)


def test_normalization_preserves_bare_unix_numbers() -> None:
    """Bare 10-13 digit numbers (order IDs, barcodes) must not be stripped."""
    base = "Order #A123. Widget SKU W123. Total $24.99."
    unix_variant_a = f"{base} Ref 1714849351000."
    unix_variant_b = f"{base} Ref 1714849351999."
    assert hash_receipt(unix_variant_a) != hash_receipt(unix_variant_b)


def test_different_content_produces_different_hash() -> None:
    other = "Order #B456. Gadget SKU G789. Total $49.99."
    assert hash_receipt(SAMPLE_BODY) != hash_receipt(other)


def test_check_duplicate_returns_true_when_exists() -> None:
    collection = AsyncMock()
    collection.find_one.return_value = {"_id": "existing-id"}

    result = asyncio.run(check_duplicate("sha256:abc", collection))

    assert result is True
    collection.find_one.assert_awaited_once_with({"receipt_hash": "sha256:abc"}, {"_id": 1})


def test_check_duplicate_returns_false_when_absent() -> None:
    collection = AsyncMock()
    collection.find_one.return_value = None

    result = asyncio.run(check_duplicate("sha256:abc", collection))

    assert result is False


def test_check_duplicate_logs_on_duplicate(caplog: pytest.LogCaptureFixture) -> None:
    collection = AsyncMock()
    collection.find_one.return_value = {"_id": "existing-id"}
    receipt_hash = "sha256:deadbeef"

    with caplog.at_level(logging.INFO, logger="src.dedup"):
        asyncio.run(check_duplicate(receipt_hash, collection))

    assert any("Duplicate receipt skipped" in record.message for record in caplog.records)
    assert any(receipt_hash in record.message for record in caplog.records)


_EXTRACTED_PAYLOAD = {
    "platform": "best_buy",
    "category": "retail",
    "product_name": "Widget",
    "product_id": "W123",
    "price_paid": 24.99,
    "purchase_date": "2026-05-04T18:22:31Z",
    "purchase_date_basis": "order_date",
    "order_id": "A123",
    "extraction_confidence": {
        "platform": 0.99,
        "price": 0.98,
        "overall_min": 0.95,
        "order_id": 0.99,
        "product_name": 0.97,
        "product_id": 0.96,
        "price_paid": 0.98,
        "purchase_date": 0.95,
        "category": 0.98,
    },
}


def _patch_extractor(monkeypatch: pytest.MonkeyPatch) -> None:
    import json

    from src import extractor
    from src.extractor import EmailForExtraction

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(_EXTRACTED_PAYLOAD)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)


def test_extract_auto_computes_receipt_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    """extract() should populate receipt_hash when caller does not supply one."""
    from src.extractor import EmailForExtraction, extract

    _patch_extractor(monkeypatch)

    email = EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Your order is confirmed",
        body_text=SAMPLE_BODY,
    )
    expected_hash = hash_receipt(SAMPLE_BODY)

    result = asyncio.run(extract(email))

    assert result["receipt_hash"] == expected_hash
    assert SHA256_PATTERN.match(result["receipt_hash"])


def test_extract_raises_duplicate_receipt_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.extractor import EmailForExtraction, extract

    _patch_extractor(monkeypatch)

    collection = AsyncMock()
    collection.find_one.return_value = {"_id": "existing-id"}

    email = EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Your order is confirmed",
        body_text=SAMPLE_BODY,
    )
    expected_hash = hash_receipt(SAMPLE_BODY)

    with pytest.raises(DuplicateReceiptError) as exc_info:
        asyncio.run(extract(email, purchases_collection=collection))

    assert exc_info.value.receipt_hash == expected_hash


def test_extract_hashes_pdf_text_when_body_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.extractor import EmailForExtraction, extract

    _patch_extractor(monkeypatch)

    pdf_content = "Order #A123 from PDF attachment"
    email = EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Your order is confirmed",
        body_text="",
        pdf_text=pdf_content,
    )

    result = asyncio.run(extract(email))

    assert result["receipt_hash"] == hash_receipt(pdf_content)


def test_extract_leaves_hash_none_when_no_text(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.extractor import EmailForExtraction, extract

    _patch_extractor(monkeypatch)

    email = EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Your order is confirmed",
        body_text="",
    )

    result = asyncio.run(extract(email))

    assert result["receipt_hash"] is None
