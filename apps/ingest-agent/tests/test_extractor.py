"""Tests for the ingest purchase field extractor."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
from claimit_mongodb_models import Purchase
from pydantic import ValidationError
from src import extractor
from src.confidence import compute_overall_min
from src.extractor import (
    EmailForExtraction,
    ExtractedPurchaseFields,
    ExtractorError,
    extract,
    extract_from_blob,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "extraction_cases.json"


def _fixture_cases() -> list[dict[str, Any]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _sample_email() -> EmailForExtraction:
    return EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Your order is confirmed",
        snippet="Thanks for your order.",
        body_text="Order #A123. Widget SKU W123. Total $24.99.",
    )


def _sample_extracted_payload() -> dict[str, Any]:
    return {
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
            "overall_min": 0.95,
            "order_id": 0.99,
            "product_name": 0.97,
            "product_id": 0.96,
            "price_paid": 0.98,
            "purchase_date": 0.95,
            "category": 0.98,
        },
    }


@pytest.mark.parametrize("case", _fixture_cases(), ids=lambda case: case["name"])
def test_extract_returns_purchase_shaped_dict_for_fixtures(
    monkeypatch: pytest.MonkeyPatch, case: dict[str, Any]
) -> None:
    async def fake_run_agent(email: EmailForExtraction) -> str:
        assert email.subject == case["email"]["subject"]
        return json.dumps(case["extracted"])

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extract(case["email"]))
    purchase = Purchase.model_validate(result)

    assert result == purchase.model_dump(by_alias=True, mode="json")
    assert result["platform"] == case["extracted"]["platform"]
    assert result["category"] == case["extracted"]["category"]
    assert result["product_name"] == case["extracted"]["product_name"]
    assert result["price_paid"] == case["extracted"]["price_paid"]
    assert result["order_id"] == case["extracted"]["order_id"]
    assert result["currency"] == "USD"
    assert result["claim_type"] == "self_service"
    assert result["monitoring_cadence_minutes"] == 360
    assert result["extraction_confidence"]["price_paid"] is not None


def test_extract_high_confidence_starts_monitoring(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _sample_extracted_payload()
    for field in (
        "platform",
        "price",
        "category",
        "product_name",
        "price_paid",
        "purchase_date",
        "order_id",
    ):
        payload["extraction_confidence"][field] = 0.99

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extract(_sample_email()))

    assert result["status"] == "monitoring"
    assert result["extraction_confidence"]["overall_min"] == pytest.approx(0.99)
    assert (
        compute_overall_min(result["extraction_confidence"])["critical_field_below_threshold"]
        is None
    )


def test_extract_low_confidence_critical_field_triggers_pending_confirmation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _sample_extracted_payload()
    payload["extraction_confidence"]["platform"] = 0.94

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extract(_sample_email()))

    assert result["status"] == "pending_confirmation"
    assert result["extraction_confidence"]["overall_min"] == pytest.approx(0.94)
    assert (
        compute_overall_min(result["extraction_confidence"])["critical_field_below_threshold"]
        == "platform"
    )


def test_extract_zero_price_paid_raises_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """price_paid=0 must fail at ExtractedPurchaseFields validation, not later."""
    payload = _sample_extracted_payload()
    payload["price_paid"] = 0

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    with pytest.raises(ValidationError, match="price_paid"):
        asyncio.run(extract(_sample_email()))


def test_extract_handles_missing_optional_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _sample_extracted_payload()
    for optional_field in (
        "product_url",
        "variant",
        "fare_class",
        "room_type",
        "bed_type",
        "rate_type",
        "member_price_at_purchase",
        "non_member_price_at_purchase",
        "member_tier_at_purchase",
    ):
        payload.pop(optional_field, None)

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extract(_sample_email()))

    assert result["variant"] is None
    assert result["member_tier_at_purchase"] is None
    assert result["member_price_at_purchase"] is None
    # Sample payload has every critical confidence >= 0.95, so it should auto-start monitoring.
    assert result["status"] == "monitoring"


def test_extract_uses_product_id_fallback_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _sample_extracted_payload()
    payload["product_id"] = None

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extract(_sample_email()))

    assert result["product_id"] == "order-a123"
    assert result["status"] == "pending_user_edit"
    assert result["extraction_confidence"]["product_id"] == 0.2
    assert result["extraction_confidence"]["overall_min"] == 0.95


def test_extract_raises_for_malformed_json(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return "probably a purchase"

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    with pytest.raises(ExtractorError, match="malformed JSON"):
        asyncio.run(extract(_sample_email()))


def test_extract_raises_for_confidence_out_of_range(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _sample_extracted_payload()
    payload["extraction_confidence"]["price"] = 1.2

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    with pytest.raises(ValidationError):
        asyncio.run(extract(_sample_email()))


def test_extract_raises_for_unsupported_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _sample_extracted_payload()
    payload["platform"] = "costco"

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    with pytest.raises(ValidationError):
        asyncio.run(extract(_sample_email()))


def test_format_email_truncates_source_text() -> None:
    email = EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Your order is confirmed",
        body_text="x" * (extractor.MAX_BODY_CHARS + 25),
        pdf_text="y" * (extractor.MAX_ATTACHMENT_CHARS + 25),
        attachment_texts=["z" * (extractor.MAX_ATTACHMENT_CHARS + 25)],
    )

    payload = json.loads(extractor._format_email(email))

    assert payload["body_text"] == "x" * extractor.MAX_BODY_CHARS
    assert payload["pdf_text"] == "y" * extractor.MAX_ATTACHMENT_CHARS
    assert payload["attachment_texts"] == ["z" * extractor.MAX_ATTACHMENT_CHARS]


def test_run_extractor_agent_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    class SlowRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            await asyncio.sleep(1)
            yield None

    monkeypatch.setattr(extractor, "Runner", SlowRunner)
    monkeypatch.setattr(extractor, "EXTRACTOR_TIMEOUT_SECONDS", 0.001)

    with pytest.raises(ExtractorError, match="timed out"):
        asyncio.run(extractor._run_extractor_agent(_sample_email()))


# ---------------------------------------------------------------------------
# extract_from_blob — vision adapter (ticket 5.14)
# ---------------------------------------------------------------------------


def test_extract_from_blob_returns_parsed_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mocked Gemini output round-trips through `_parse_extraction_output`."""
    captured: dict[str, object] = {}

    async def fake_run_blob(*, data: bytes, mime_type: str) -> str:
        captured["data"] = data
        captured["mime_type"] = mime_type
        return json.dumps(_sample_extracted_payload())

    monkeypatch.setattr(extractor, "_run_extractor_agent_blob", fake_run_blob)

    result = asyncio.run(extract_from_blob(data=b"%PDF-1.4 fake", mime_type="application/pdf"))

    assert isinstance(result, ExtractedPurchaseFields)
    assert result.platform == "best_buy"
    assert result.price_paid == 24.99
    assert result.extraction_confidence.overall_min == 0.95
    assert captured["data"] == b"%PDF-1.4 fake"
    assert captured["mime_type"] == "application/pdf"


@pytest.mark.parametrize("mime_type", ["application/pdf", "image/png", "image/jpeg"])
def test_extract_from_blob_accepts_all_allowed_mime_types(
    monkeypatch: pytest.MonkeyPatch, mime_type: str
) -> None:
    """Every mime type the upload validator accepts must run through extraction."""

    async def fake_run_blob(*, data: bytes, mime_type: str) -> str:
        return json.dumps(_sample_extracted_payload())

    monkeypatch.setattr(extractor, "_run_extractor_agent_blob", fake_run_blob)
    asyncio.run(extract_from_blob(data=b"raw", mime_type=mime_type))


@pytest.mark.parametrize(
    "mime_type",
    ["application/octet-stream", "text/plain", "image/gif", ""],
)
def test_extract_from_blob_rejects_unsupported_mime_type(mime_type: str) -> None:
    """Refuse upfront so a corrupt URI never burns a Gemini call."""
    with pytest.raises(ValueError, match="Unsupported"):
        asyncio.run(extract_from_blob(data=b"raw", mime_type=mime_type))


def test_extract_from_blob_rejects_empty_bytes() -> None:
    with pytest.raises(ValueError, match="empty"):
        asyncio.run(extract_from_blob(data=b"", mime_type="application/pdf"))


def test_extract_from_blob_raises_extractor_error_on_empty_model_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_run_blob(*, data: bytes, mime_type: str) -> str | None:
        return None

    monkeypatch.setattr(extractor, "_run_extractor_agent_blob", fake_run_blob)

    with pytest.raises(ExtractorError, match="empty output"):
        asyncio.run(extract_from_blob(data=b"raw", mime_type="application/pdf"))


def test_extract_from_blob_propagates_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Out-of-range confidence in the model output surfaces as ValidationError."""
    payload = _sample_extracted_payload()
    payload["extraction_confidence"]["platform"] = 1.5  # invalid: ge=0/le=1

    async def fake_run_blob(*, data: bytes, mime_type: str) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent_blob", fake_run_blob)

    with pytest.raises(ValidationError):
        asyncio.run(extract_from_blob(data=b"raw", mime_type="application/pdf"))


def test_run_extractor_agent_blob_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    """Same timeout taxonomy as the email path — error message identifies blob."""

    class SlowRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            await asyncio.sleep(1)
            yield None

    monkeypatch.setattr(extractor, "Runner", SlowRunner)
    monkeypatch.setattr(extractor, "EXTRACTOR_TIMEOUT_SECONDS", 0.001)

    with pytest.raises(ExtractorError, match="blob"):
        asyncio.run(extractor._run_extractor_agent_blob(data=b"x", mime_type="application/pdf"))
