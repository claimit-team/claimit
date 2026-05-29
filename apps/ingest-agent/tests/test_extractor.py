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


def test_extract_routes_multi_item_to_pending_user_edit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A model output with line_items_detected > 1 must route to pending_user_edit
    even when every confidence score is high — the picked price is for ONE item
    out of many and the user must confirm or pick a different line. See issue #183.
    """
    payload = _sample_extracted_payload()
    payload["line_items_detected"] = 4
    # The model already self-downgraded price_paid confidence per the prompt
    # rule (<= 0.4). The defensive in-code clamp should leave this untouched.
    payload["extraction_confidence"]["price_paid"] = 0.3

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extract(_sample_email()))

    assert result["status"] == "pending_user_edit"
    assert result["extraction_confidence"]["price_paid"] == 0.3
    # Transient extractor-only field must never reach the Purchase payload.
    assert "line_items_detected" not in result


def test_extract_clamps_multi_item_price_confidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the model returns line_items_detected > 1 but a high price_paid
    confidence, the in-code defensive clamp must downgrade it to <= 0.4.
    """
    payload = _sample_extracted_payload()
    payload["line_items_detected"] = 2
    payload["extraction_confidence"]["price_paid"] = 0.99  # over-confident

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extract(_sample_email()))

    assert result["status"] == "pending_user_edit"
    assert result["extraction_confidence"]["price_paid"] == 0.4
    # overall_min should now reflect the downgraded price_paid.
    assert result["extraction_confidence"]["overall_min"] <= 0.4
    # Transient extractor-only field must never reach the Purchase payload.
    assert "line_items_detected" not in result


def test_extracted_purchase_fields_defaults_line_items_to_one() -> None:
    """Schema must accept payloads that omit line_items_detected — every
    existing email-path fixture omits the field, so it must default to 1.
    """
    payload = _sample_extracted_payload()
    payload.pop("line_items_detected", None)
    extracted = ExtractedPurchaseFields.model_validate(payload)
    assert extracted.line_items_detected == 1


def test_line_item_price_paid_must_be_positive() -> None:
    """A line with price_paid <= 0 fails LineItem validation, like the top-level."""
    payload = _sample_extracted_payload()
    payload["line_items_detected"] = 2
    payload["line_items"] = [
        {
            "product_name": "Bad",
            "product_id": None,
            "price_paid": 0,
            "confidence": {"price_paid": 0.5},
        },
    ]
    with pytest.raises(ValidationError, match="price_paid"):
        ExtractedPurchaseFields.model_validate(payload)


def test_build_line_item_payloads_empty_for_single_item() -> None:
    """Single-item extraction (no line_items) → no per-line payloads."""
    extracted = ExtractedPurchaseFields.model_validate(_sample_extracted_payload())
    assert extractor.build_line_item_payloads(extracted) == []


def test_build_line_item_payloads_resolves_each_line() -> None:
    payload = _sample_extracted_payload()
    payload["line_items_detected"] = 2
    payload["line_items"] = [
        {
            "product_name": "Laptop",
            "product_id": "L999",
            "variant": "16GB",
            "price_paid": 999.0,
            "confidence": {"product_name": 0.97, "price_paid": 0.96},
        },
        {
            # No product_id → order- fallback + FALLBACK confidence.
            "product_name": "Mouse",
            "product_id": None,
            "price_paid": 29.0,
            "confidence": {"product_name": 0.95, "price_paid": 0.94},
        },
    ]
    extracted = ExtractedPurchaseFields.model_validate(payload)

    payloads = extractor.build_line_item_payloads(extracted)
    assert [p["receipt_line_key"] for p in payloads] == ["line-0", "line-1"]

    laptop, mouse = payloads
    assert laptop["product_id"] == "L999"
    # Per-line price confidence is the line's own (uncapped).
    assert laptop["extraction_confidence"]["price_paid"] == 0.96
    assert laptop["extraction_confidence"]["price"] == 0.96

    # order- fallback applied for the SKU-less line.
    assert mouse["product_id"] == "order-a123"
    assert mouse["extraction_confidence"]["product_id"] == extractor.FALLBACK_PRODUCT_ID_CONFIDENCE
    # Fallback line routes to user edit (mirrors the single-item fallback).
    assert mouse["status"] == "pending_user_edit"


def test_resolve_status_multi_item_overrides_high_confidence() -> None:
    """_resolve_status(multi_item=True) must return pending_user_edit
    regardless of confidence, mirroring the fallback_used branch.
    """
    high_conf = {
        "platform": 1.0,
        "price": 1.0,
        "overall_min": 1.0,
        "price_paid": 0.3,
        "order_id": 1.0,
        "purchase_date": 1.0,
    }
    assert extractor._resolve_status(False, high_conf, multi_item=True) == "pending_user_edit"
    # Single-item path still derives status from confidence.
    assert extractor._resolve_status(False, high_conf, multi_item=False) == "pending_confirmation"


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


# ---------------------------------------------------------------------------
# genai teardown AttributeError safety net (post-5.14 prod-verification fix).
#
# Pre-fix, an AttributeError raised by `BaseApiClient.aclose()` (Vertex
# async-auth path leaves `_async_httpx_client = None`) bubbled out of
# `runner.run_async(...)` and aborted extraction — the doc stayed at the
# upload sentinel `overall_min=0.0` and the FE confirm page polled forever.
# These tests pin the two-mode recovery: Scenario A (result captured
# before teardown -> recover) vs Scenario B (no result yet -> raise
# ExtractorError so the handler's rescue path fires).
# ---------------------------------------------------------------------------


class _FakeFinalEvent:
    """Minimal event shape that satisfies `event.is_final_response()` and
    `_extract_event_text(event)` — mirrors the parts the real ADK event
    carries via `event.content.parts[*].text`."""

    class _Part:
        def __init__(self, text: str) -> None:
            self.text = text

    class _Content:
        def __init__(self, text: str) -> None:
            self.parts = [_FakeFinalEvent._Part(text)]

    def __init__(self, text: str) -> None:
        self.content = _FakeFinalEvent._Content(text)

    def is_final_response(self) -> bool:
        return True


def _install_runner_emitting(
    monkeypatch: pytest.MonkeyPatch,
    *,
    yield_final: bool,
    raise_at: str,
) -> None:
    """Patch `extractor.Runner` with a fake whose `run_async` yields a
    final event then optionally raises `AttributeError`.

    `raise_at`:
      - "none"        -> never raise (happy path).
      - "after_final" -> emit final event, then raise on the next loop iteration
        (Scenario A: real result captured, teardown subsequently errored).
      - "before_any"  -> raise before yielding anything (Scenario B: async
        transport never produced a response).
    """
    payload_text = json.dumps(_sample_extracted_payload())

    class FakeRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            if raise_at == "before_any":
                raise AttributeError(
                    "'BaseApiClient' object has no attribute '_async_httpx_client'"
                )
            if yield_final:
                yield _FakeFinalEvent(payload_text)
            if raise_at == "after_final":
                raise AttributeError(
                    "'BaseApiClient' object has no attribute '_async_httpx_client'"
                )

    monkeypatch.setattr(extractor, "Runner", FakeRunner)


@pytest.mark.parametrize("path", ["email", "blob"])
def test_attribute_error_after_final_response_returns_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, path: str
) -> None:
    """Scenario A — teardown errors AFTER we captured a real response.

    The guard must swallow the AttributeError, log the recovery, and
    return the captured text so `extract_from_blob` / `extract` still
    produce real fields. Without this, every Vertex async-auth call
    on Cloud Run would fall through to the rescue-finalize path even
    though the model actually returned a valid extraction.
    """
    _install_runner_emitting(monkeypatch, yield_final=True, raise_at="after_final")
    caplog.set_level("WARNING", logger="src.extractor")

    if path == "email":
        result = asyncio.run(extractor._run_extractor_agent(_sample_email()))
    else:
        result = asyncio.run(
            extractor._run_extractor_agent_blob(data=b"x", mime_type="application/pdf")
        )

    assert result is not None
    # Round-trips through the JSON parser cleanly — proves we returned
    # the actual model output not a placeholder string.
    parsed = json.loads(result)
    assert parsed["platform"] == "best_buy"
    # Both diagnostic logs fire on the Scenario A path so prod can grep
    # for the recovery + know which scenario we're in.
    assert any("extractor.attribute_error_caught" in rec.message for rec in caplog.records)
    assert any("extractor.recovered_after_teardown_error" in rec.message for rec in caplog.records)
    # No `runner_loop_exit` because the exception path returns early; the
    # `attribute_error_caught` log carries the same `final_text_captured`
    # signal so observability is preserved.


@pytest.mark.parametrize("path", ["email", "blob"])
def test_attribute_error_with_no_final_response_raises(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, path: str
) -> None:
    """Scenario B — teardown errors BEFORE the model produced any result.

    Nothing to recover. The guard must raise `ExtractorError` (with the
    AttributeError chained) so the upload handler's rescue path fires
    and the doc transitions to `overall_min=0.01` instead of staying
    stuck at the sentinel. This is the failure mode that the 2b
    root-cause fix must eliminate from the steady state — the guard
    here is the safety net, NOT the acceptable resting state.
    """
    _install_runner_emitting(monkeypatch, yield_final=False, raise_at="before_any")
    caplog.set_level("ERROR", logger="src.extractor")

    runner_callable = (
        extractor._run_extractor_agent
        if path == "email"
        else (lambda: extractor._run_extractor_agent_blob(data=b"x", mime_type="application/pdf"))
    )

    with pytest.raises(ExtractorError, match="teardown error with no result captured"):
        if path == "email":
            asyncio.run(extractor._run_extractor_agent(_sample_email()))
        else:
            asyncio.run(runner_callable())

    assert any("extractor.unrecoverable_attribute_error" in rec.message for rec in caplog.records)


@pytest.mark.parametrize("path", ["email", "blob"])
def test_unrelated_attribute_error_is_reraised_not_rescued(
    monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    """An AttributeError that ISN'T the genai teardown bug must NOT be rescued.

    Pre-narrowing the predicate, any `AttributeError` raised inside the
    runner loop would be treated as the genai teardown bug. A typo in
    `event.is_final_response()` or an ADK API shape change would then
    be silently swallowed and the function would either return None
    (Scenario B) or a stale final_text — both worse than just crashing.
    Pin the re-raise behavior so the narrowing predicate can't regress.
    """

    class UnrelatedAttributeErrorRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            raise AttributeError("'SomethingElse' object has no attribute 'totally_unrelated'")
            yield  # never reached — keeps the runtime happy that this is an async generator

    monkeypatch.setattr(extractor, "Runner", UnrelatedAttributeErrorRunner)

    with pytest.raises(AttributeError, match="totally_unrelated"):
        if path == "email":
            asyncio.run(extractor._run_extractor_agent(_sample_email()))
        else:
            asyncio.run(extractor._run_extractor_agent_blob(data=b"x", mime_type="application/pdf"))


@pytest.mark.parametrize("path", ["email", "blob"])
def test_runner_loop_exit_log_fires_with_captured_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, path: str
) -> None:
    """Happy path — instrumentation log lands with `final_text_captured=True`.

    This is the single load-bearing log line for disambiguating
    Scenario A vs B in prod: a tail of `extractor.runner_loop_exit`
    with `final_text_captured: true` on every upload is what proves
    the 2b root-cause fix worked. Asserting it fires here gives
    confidence the log line wasn't removed by a future refactor.
    """
    _install_runner_emitting(monkeypatch, yield_final=True, raise_at="none")
    caplog.set_level("INFO", logger="src.extractor")

    if path == "email":
        asyncio.run(extractor._run_extractor_agent(_sample_email()))
    else:
        asyncio.run(extractor._run_extractor_agent_blob(data=b"x", mime_type="application/pdf"))

    exit_logs = [rec for rec in caplog.records if "extractor.runner_loop_exit" in rec.message]
    assert len(exit_logs) == 1
    # `extra={...}` lands on the LogRecord as direct attributes; both
    # the boolean and the length are needed for Cloud Logging filters.
    rec = exit_logs[0]
    assert rec.final_text_captured is True
    assert rec.final_text_len > 0
    assert rec.path == path


# ---------------------------------------------------------------------------
# extract_from_email — ticket 4.17 public seam
# ---------------------------------------------------------------------------
#
# The full email-path `extract()` orchestrator does dedup, payload build,
# and confirmation-email side effects on top of the Gemini call. The 4.17
# Gmail ingest handler doesn't want any of that — it has its own
# sentinel-insert + finalize flow. `extract_from_email` is the inner
# Gemini-call+parse seam factored out for that consumer.


def test_extract_from_email_returns_parsed_extracted_purchase_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Happy path: Gemini returns valid JSON → returns ExtractedPurchaseFields."""

    async def fake_run_agent(email: EmailForExtraction) -> str:
        return json.dumps(_sample_extracted_payload())

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    result = asyncio.run(extractor.extract_from_email(_sample_email()))
    assert isinstance(result, ExtractedPurchaseFields)
    assert result.platform == "best_buy"
    assert result.price_paid == 24.99
    assert result.order_id == "A123"
    # Confidence aggregate stays raw — the Purchase-payload-building
    # logic in finalize.py is what computes overall_min from material
    # fields. extract_from_email returns whatever the model produced.
    assert result.extraction_confidence.overall_min == 0.95


def test_extract_from_email_empty_output_raises_extractor_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Gemini returning empty string → ExtractorError. Same surface as
    the existing extract() empty-output path so the 4.17 handler can
    catch the same way."""

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return ""

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    with pytest.raises(ExtractorError):
        asyncio.run(extractor.extract_from_email(_sample_email()))


def test_extract_from_email_malformed_json_raises_extractor_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Gemini returning non-JSON → ExtractorError (not a raw
    JSONDecodeError) so the handler's except clause stays clean."""

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return "this is not json"

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    with pytest.raises(ExtractorError):
        asyncio.run(extractor.extract_from_email(_sample_email()))


def test_extract_from_email_schema_violation_raises_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Gemini returning JSON that violates the ExtractedPurchaseFields
    schema → pydantic.ValidationError. Same surface as extract_from_blob.
    The 4.17 handler catches all exceptions in this branch anyway."""

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        payload = _sample_extracted_payload()
        payload["price_paid"] = "not a number"  # schema requires float
        return json.dumps(payload)

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)

    with pytest.raises(ValidationError):
        asyncio.run(extractor.extract_from_email(_sample_email()))


def test_extract_from_email_no_side_effects(monkeypatch: pytest.MonkeyPatch) -> None:
    """The function must NOT call the dedup check, the confirmation
    email sender, or any Mongo helper. Asserting via monkeypatched
    sentinels: if any of those got called, the test would fail."""

    called = {"dedup": False, "email": False}

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(_sample_extracted_payload())

    async def fake_check_duplicate(*_args, **_kwargs):
        called["dedup"] = True
        return False

    async def fake_send_confirmation(*_args, **_kwargs):
        called["email"] = True

    monkeypatch.setattr(extractor, "_run_extractor_agent", fake_run_agent)
    monkeypatch.setattr(extractor, "check_duplicate", fake_check_duplicate)
    monkeypatch.setattr(extractor, "maybe_send_confirmation_email", fake_send_confirmation)

    asyncio.run(extractor.extract_from_email(_sample_email()))
    assert called == {"dedup": False, "email": False}
