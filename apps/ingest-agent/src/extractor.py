"""Purchase field extractor for order-confirmation ingestion."""

from __future__ import annotations

import asyncio
import inspect
import json
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID, uuid4

from claimit_mongodb_models import Purchase
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field, ValidationError, field_validator

from src.confidence import compute_overall_min
from src.dedup import DuplicateReceiptError, check_duplicate, hash_receipt
from src.notifier import maybe_send_confirmation_email

MODEL_NAME = "gemini-2.5-flash"
APP_NAME = "claimit-ingest-extractor"
MAX_BODY_CHARS = 16_000
MAX_ATTACHMENT_CHARS = 12_000
EXTRACTOR_TIMEOUT_SECONDS = 30
DEFAULT_CLAIM_WINDOW_DAYS = 15
DEFAULT_MONITORING_CADENCE_MINUTES = 360
FALLBACK_PRODUCT_ID_CONFIDENCE = 0.2

PlatformValue = Literal[
    "best_buy",
    "amazon",
    "target",
    "walmart",
    "marriott",
    "hilton",
    "delta",
    "united",
    "american",
    "southwest",
]
CategoryValue = Literal["retail", "airline", "hotel"]
PurchaseDateBasisValue = Literal["order_date", "ship_date", "pickup_date", "check_in_date"]
IngestionSourceValue = Literal["gmail", "upload_pdf", "upload_image"]

EXTRACTOR_SYSTEM_PROMPT = """
You extract structured purchase fields from one order-confirmation email and any OCR/PDF text.

Return only facts visible in the supplied email or attachment text. Do not infer product IDs, loyalty tiers, URLs, variants, room details, or fare details unless the text explicitly says them.

Use these normalized enum values:
- platform: best_buy, amazon, target, walmart, marriott, hilton, delta, united, american, southwest
- category: retail, hotel, airline
- purchase_date_basis: order_date for normal retail/order confirmations, check_in_date for hotel reservations when the only purchase-like date is check-in, ship_date or pickup_date only when that is the only usable purchase date

Extraction rules:
- platform is the merchant or travel provider, not Gmail or a payment processor.
- product_name is the primary item, stay, or flight itinerary being monitored for a price claim.
- product_id is SKU, ASIN, hotel confirmation item code, fare code, or merchant product identifier when present. Use null when absent.
- price_paid is the final amount paid or charged by the customer in USD.
- member_price_at_purchase and non_member_price_at_purchase are only populated when the receipt explicitly shows member/non-member comparison prices.
- member_tier_at_purchase is null unless a loyalty tier is explicitly present.
- variant is null unless color, size, capacity, room/fare variant, or similar variant is explicit.
- product_url is null unless a product or booking URL is present.
- retail category-specific hotel/airline fields must be null.

Confidence rules:
- Provide confidence values from 0.0 to 1.0 for every field you extract and every nullable field when there is evidence for absence.
- price is the same confidence as price_paid.
- overall_min is the minimum confidence among material required extracted fields.
- Use lower confidence for OCR ambiguity, forwarded emails, missing itemization, or conflicting totals.

Respond with ONLY a JSON object matching the schema. No prose and no markdown fences.
""".strip()


class ExtractorError(RuntimeError):
    """Raised when purchase extraction returns empty or malformed structured output."""


class EmailForExtraction(BaseModel):
    """Email and attachment text needed to extract a Purchase-shaped record."""

    user_id: UUID
    sender: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    snippet: str = ""
    body_text: str = ""
    pdf_text: str | None = None
    attachment_texts: list[str] = Field(default_factory=list)
    ingestion_source: IngestionSourceValue = "gmail"
    receipt_storage_url: str | None = None
    receipt_hash: str | None = None


class ExtractedFieldConfidence(BaseModel):
    """Field-level extraction confidence returned by the model."""

    platform: float = Field(ge=0.0, le=1.0)
    price: float = Field(ge=0.0, le=1.0)
    overall_min: float = Field(ge=0.0, le=1.0)
    order_id: float | None = Field(default=None, ge=0.0, le=1.0)
    product_name: float | None = Field(default=None, ge=0.0, le=1.0)
    product_id: float | None = Field(default=None, ge=0.0, le=1.0)
    price_paid: float | None = Field(default=None, ge=0.0, le=1.0)
    member_price_at_purchase: float | None = Field(default=None, ge=0.0, le=1.0)
    purchase_date: float | None = Field(default=None, ge=0.0, le=1.0)
    member_tier_at_purchase: float | None = Field(default=None, ge=0.0, le=1.0)
    variant: float | None = Field(default=None, ge=0.0, le=1.0)
    category: float | None = Field(default=None, ge=0.0, le=1.0)


class ExtractedPurchaseFields(BaseModel):
    """Model-output fields that are directly extracted from source text."""

    platform: PlatformValue
    category: CategoryValue
    product_name: str = Field(min_length=1)
    product_id: str | None = None
    product_url: str | None = None
    variant: str | None = None
    fare_class: str | None = None
    room_type: str | None = None
    bed_type: str | None = None
    rate_type: str | None = None
    price_paid: float = Field(ge=0)
    member_price_at_purchase: float | None = Field(default=None, ge=0)
    non_member_price_at_purchase: float | None = Field(default=None, ge=0)
    purchase_date: datetime
    purchase_date_basis: PurchaseDateBasisValue
    order_id: str = Field(min_length=1)
    member_tier_at_purchase: str | None = None
    extraction_confidence: ExtractedFieldConfidence

    @field_validator("price_paid", mode="after")
    @classmethod
    def _price_paid_must_be_positive(cls, value: float) -> float:
        # Field-level constraint is `ge=0` (not `gt=0`) so Vertex AI accepts the
        # JSON Schema (it rejects `exclusiveMinimum`). This runtime validator
        # closes the gap so a $0 extraction still fails fast before reaching
        # the Mongo Purchase model.
        if value <= 0:
            raise ValueError("price_paid must be greater than zero")
        return value


def _build_extractor_agent() -> Agent:
    return Agent(
        name="purchase_field_extractor",
        model=MODEL_NAME,
        instruction=EXTRACTOR_SYSTEM_PROMPT,
        output_schema=ExtractedPurchaseFields,
        tools=[],
    )


def _truncate_text(value: str | None, max_chars: int) -> str | None:
    if value is None:
        return None
    return value[:max_chars]


def _format_email(email: EmailForExtraction) -> str:
    payload = {
        "sender": email.sender,
        "subject": email.subject,
        "snippet": email.snippet,
        "body_text": email.body_text[:MAX_BODY_CHARS],
        "pdf_text": _truncate_text(email.pdf_text, MAX_ATTACHMENT_CHARS),
        "attachment_texts": [
            attachment[:MAX_ATTACHMENT_CHARS] for attachment in email.attachment_texts
        ],
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _extract_event_text(event: Any) -> str | None:
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []
    text_parts = [part.text for part in parts if getattr(part, "text", None)]
    if not text_parts:
        return None
    return "\n".join(text_parts)


def _strip_json_fence(raw_output: str) -> str:
    output = raw_output.strip()
    if not output.startswith("```"):
        return output

    lines = output.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _parse_extraction_output(raw_output: str | None) -> ExtractedPurchaseFields:
    if not raw_output or not raw_output.strip():
        raise ExtractorError("Extractor returned empty output")

    try:
        payload = json.loads(_strip_json_fence(raw_output))
    except json.JSONDecodeError as exc:
        raise ExtractorError("Extractor returned malformed JSON") from exc

    try:
        return ExtractedPurchaseFields.model_validate(payload)
    except ValidationError:
        raise
    except Exception as exc:
        raise ExtractorError("Extractor returned an invalid payload") from exc


async def _maybe_await[T](value: T) -> T:
    if inspect.isawaitable(value):
        return await value
    return value


async def _run_extractor_agent(email: EmailForExtraction) -> str | None:
    session_service = InMemorySessionService()
    session_id = f"extract-{uuid4()}"
    user_id = "ingest-extractor"

    await _maybe_await(
        session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
    )

    runner = Runner(
        app_name=APP_NAME,
        agent=_build_extractor_agent(),
        session_service=session_service,
    )
    message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=_format_email(email))],
    )

    final_text: str | None = None
    try:
        async with asyncio.timeout(EXTRACTOR_TIMEOUT_SECONDS):
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
            ):
                if event.is_final_response():
                    final_text = _extract_event_text(event)
    except TimeoutError as exc:
        raise ExtractorError(
            f"Extractor timed out for user_id={user_id} session_id={session_id}"
        ) from exc

    return final_text


def _merge_confidence_aggregate(payload: dict[str, float | None]) -> None:
    agg = compute_overall_min(payload)
    payload["overall_min"] = agg["overall_min"]


def _confidence_payload(confidence: ExtractedFieldConfidence) -> dict[str, float | None]:
    payload = confidence.model_dump()
    if payload["price_paid"] is None:
        payload["price_paid"] = payload["price"]
    _merge_confidence_aggregate(payload)

    return payload


def _resolve_status(fallback_used: bool, confidence: dict[str, float | None]) -> str:
    """Pick the initial purchase status based on extraction outcome.

    Priority order (highest wins):
      1. `pending_user_edit` — product_id was missing and we synthesized a fallback;
         user must edit before monitoring can be useful.
      2. `pending_confirmation` — a critical field (platform, price_paid, order_id,
         purchase_date) scored strictly below the configured threshold per master
         doc 5.1; the user must confirm before monitoring starts.
      3. `monitoring` — all critical fields cleared the threshold; auto-start
         monitoring.
    """
    if fallback_used:
        return "pending_user_edit"
    agg = compute_overall_min(confidence)
    if agg["critical_field_below_threshold"] is not None:
        return "pending_confirmation"
    return "monitoring"


def _purchase_payload(
    email: EmailForExtraction,
    extracted: ExtractedPurchaseFields,
    now: datetime | None = None,
) -> dict[str, Any]:
    timestamp = now or datetime.now(UTC)
    fallback_used = False
    product_id = extracted.product_id
    confidence = _confidence_payload(extracted.extraction_confidence)

    if not product_id:
        normalized_order_id = "".join(
            char.lower() if char.isalnum() else "-" for char in extracted.order_id
        ).strip("-")
        product_id = f"order-{normalized_order_id}"
        fallback_used = True
        confidence["product_id"] = FALLBACK_PRODUCT_ID_CONFIDENCE
        _merge_confidence_aggregate(confidence)

    status = _resolve_status(fallback_used, confidence)

    return {
        "_id": uuid4(),
        "updated_at": timestamp,
        "user_id": email.user_id,
        "platform": extracted.platform,
        "category": extracted.category,
        "product_name": extracted.product_name,
        "product_id": product_id,
        "product_url": extracted.product_url,
        "variant": extracted.variant,
        "fare_class": extracted.fare_class,
        "room_type": extracted.room_type,
        "bed_type": extracted.bed_type,
        "rate_type": extracted.rate_type,
        "price_paid": extracted.price_paid,
        "member_price_at_purchase": extracted.member_price_at_purchase,
        "non_member_price_at_purchase": extracted.non_member_price_at_purchase,
        "currency": "USD",
        "purchase_date": extracted.purchase_date,
        "purchase_date_basis": extracted.purchase_date_basis,
        "window_expires": extracted.purchase_date + timedelta(days=DEFAULT_CLAIM_WINDOW_DAYS),
        "order_id": extracted.order_id,
        "member_tier_at_purchase": extracted.member_tier_at_purchase,
        "status": status,
        "claim_type": "self_service",
        "monitoring_cadence_minutes": DEFAULT_MONITORING_CADENCE_MINUTES,
        "ingested_at": timestamp,
        "ingestion_source": email.ingestion_source,
        "receipt_storage_url": email.receipt_storage_url,
        "receipt_hash": email.receipt_hash,
        "extraction_confidence": confidence,
    }


def _hashable_receipt_content(email: EmailForExtraction) -> str:
    """Return canonical text to hash for dedup across all available sources."""
    parts: list[str] = []

    body = email.body_text.strip()
    if body:
        parts.append(body)

    pdf = (email.pdf_text or "").strip()
    if pdf:
        parts.append(pdf)

    parts.extend(text.strip() for text in email.attachment_texts if text.strip())
    return "\n---receipt-part---\n".join(parts)


async def extract(
    email: EmailForExtraction | dict[str, Any],
    *,
    purchases_collection: Any | None = None,
    user_email: str | None = None,
    gmail_refresh_token_ref: str | None = None,
    gmail_connected_email: str | None = None,
) -> dict[str, Any]:
    """Extract and validate a Purchase-shaped dictionary from an order email.

    When extraction yields ``pending_confirmation`` and ``user_email`` is set,
    sends a confirmation email with a deep link to ``/confirm/{purchase_id}``.
    Email failures are logged and do not fail extraction.
    """

    validated_email = EmailForExtraction.model_validate(email)
    if validated_email.receipt_hash is None:
        hashable = _hashable_receipt_content(validated_email)
        if hashable:
            validated_email.receipt_hash = hash_receipt(hashable)

    if (
        purchases_collection is not None
        and validated_email.receipt_hash is not None
        and await check_duplicate(validated_email.receipt_hash, purchases_collection)
    ):
        raise DuplicateReceiptError(validated_email.receipt_hash)

    raw_output = await _run_extractor_agent(validated_email)
    extracted = _parse_extraction_output(raw_output)
    purchase = Purchase.model_validate(_purchase_payload(validated_email, extracted))
    result = purchase.model_dump(by_alias=True, mode="json")
    await maybe_send_confirmation_email(
        result,
        user_email=user_email,
        gmail_refresh_token_ref=gmail_refresh_token_ref,
        gmail_connected_email=gmail_connected_email,
    )
    return result
