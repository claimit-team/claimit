"""Order-confirmation classifier for Gmail ingestion."""

from __future__ import annotations

import asyncio
import inspect
import json
from typing import Any
from uuid import uuid4

from claimit_mongodb_models import (
    IngestionSkiplistEntry,
    compute_format_hash,
    normalize_sender,
)
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

MODEL_NAME = "gemini-2.5-flash"
APP_NAME = "claimit-ingest-classifier"
MAX_BODY_CHARS = 12_000
CLASSIFIER_TIMEOUT_SECONDS = 20

CLASSIFIER_SYSTEM_PROMPT = """
You are an email classifier. Your only job is to decide whether a single email is an ORDER CONFIRMATION from a merchant, sent to the recipient because they just placed a purchase.

## What counts as an order confirmation

An order confirmation is a transactional email sent by a merchant (or a payment processor acting for one) immediately after a customer places an order. It typically contains AT LEAST ONE of:
- An order number, confirmation number, or receipt number
- A list of items purchased (SKUs, product names, quantities)
- An order total, subtotal, tax, or amount charged
- Wording like "Thanks for your order", "Your order is confirmed", "Order received", "Payment received", "Your receipt from <merchant>"

It is addressed to the buyer about THEIR purchase. It is not generic marketing, not a shipping update, not a refund, not a review request.

## What does NOT count (common false positives)

- Shipping / delivery notifications ("Your package is on the way", "Out for delivery", "Delivered") — these come AFTER the order confirmation and are a separate event
- Return, refund, or cancellation notices
- Abandoned cart / "you left items behind" emails
- Price drop alerts, restock alerts, wishlist notifications
- Review requests ("How was your order?")
- Marketing / promotional emails, newsletters, sales announcements
- Account notifications: password reset, login alert, 2FA code, email verification, terms-of-service update
- Subscription renewal REMINDERS (upcoming charge) — but an actual renewal RECEIPT counts as an order
- Bill / invoice from a utility or service provider where no discrete "order" was placed (e.g. monthly electricity bill). Edge case: if uncertain, lean no.
- Calendar invites, meeting notes, personal correspondence
- Order confirmations forwarded by the user to themselves or someone else — if the email is clearly a forward and the original was a confirmation, still classify as order (is_order: true) but lower confidence by ~0.1

## Examples

### Positive (is_order: true)

1. Subject: "Your Amazon.com order #112-4837261-9384726"
   Body: "Thanks for your order, Sarah. Arriving Friday, Nov 21. 1x Anker USB-C Cable - $12.99. Order total: $14.07."
   → {"is_order": true, "confidence": 0.99}

2. Subject: "Order confirmed — Uniqlo"
   Body: "Hi Raj, we've received your order #UQ8827341. 2x Heattech Crew Neck T-Shirt (M, Black) — ¥1,990 each. Subtotal ¥3,980."
   → {"is_order": true, "confidence": 0.98}

3. Subject: "Receipt from Blue Bottle Coffee"
   Body: "Payment of $24.50 to Blue Bottle Coffee. Items: 1x Bella Donovan 12oz, 1x Hayes Valley Espresso 8.8oz."
   → {"is_order": true, "confidence": 0.95}

4. Subject: "Thanks for your purchase!"
   Body: "Order #5582. Your digital download (Ableton Live 12 Suite) is ready. Amount charged: $749.00 to Visa ending 4421."
   → {"is_order": true, "confidence": 0.97}

5. Subject: "Your DoorDash order from Tartine Bakery"
   Body: "Order placed at 9:14 AM. 1x Morning Bun, 1x Cortado. Subtotal $11.50, fees & tax $3.20, total $14.70."
   → {"is_order": true, "confidence": 0.98}

6. Subject: "Subscription renewed — NYT"
   Body: "Your New York Times All Access subscription renewed. $25.00 charged to card ending 0921. Receipt #NYT-22841."
   → {"is_order": true, "confidence": 0.9}

### Negative (is_order: false)

1. Subject: "Your package has shipped!"
   Body: "Your Amazon order #112-4837261 is on the way. Track it here."
   → {"is_order": false, "confidence": 0.97}  // shipping update, not the confirmation

2. Subject: "You left something in your cart"
   Body: "Still thinking it over? Your Allbirds Tree Runners are waiting. Complete your order now."
   → {"is_order": false, "confidence": 0.99}

3. Subject: "Reset your password"
   Body: "We received a request to reset the password for your account. Click the link below."
   → {"is_order": false, "confidence": 1.0}

4. Subject: "🔥 30% off everything this weekend"
   Body: "Our biggest sale of the year ends Sunday. Shop now."
   → {"is_order": false, "confidence": 1.0}

5. Subject: "How was your recent order?"
   Body: "We'd love your feedback on the Bella Donovan you ordered last week. Leave a review."
   → {"is_order": false, "confidence": 0.96}

6. Subject: "Your monthly newsletter"
   Body: "This month at Stripe: new features, blog highlights, upcoming events."
   → {"is_order": false, "confidence": 1.0}

7. Subject: "Your refund has been processed"
   Body: "We've refunded $49.00 for order #8821 back to your original payment method."
   → {"is_order": false, "confidence": 0.94}  // refund, not order

## Output format

Respond with ONLY a JSON object, no prose, no markdown fences:

{"is_order": <true|false>, "confidence": <float between 0 and 1>}

## Confidence calibration

- 0.95-1.00: unambiguous. Clear order number + items + total, or clearly a password reset / newsletter / shipping notice.
- 0.80-0.94: strong signals but one ambiguity (e.g. receipt with no item list, or marketing email that mentions a past order).
- 0.60-0.79: genuinely mixed signals. Flag this range for human review downstream.
- Below 0.60: very unclear. Default to is_order: false at this level unless there's at least one strong positive signal.

Now classify the following email.
""".strip()


class ClassifierError(RuntimeError):
    """Raised when the classifier returns empty or malformed structured output."""


class EmailForClassification(BaseModel):
    """Minimal email fields needed to classify a Gmail message."""

    sender: str = Field(min_length=1)
    subject: str = Field(min_length=1)
    snippet: str = ""
    body_text: str = ""


class _LLMClassification(BaseModel):
    """Schema the Gemini model is asked to produce (no skiplist signal)."""

    is_order: bool
    confidence: float = Field(ge=0.0, le=1.0)


class ClassificationResult(BaseModel):
    """Structured classifier decision."""

    is_order: bool
    confidence: float = Field(ge=0.0, le=1.0)
    skiplist_hit: bool = False


def _skiplist_match(
    email: EmailForClassification,
    skiplist: list[IngestionSkiplistEntry] | None,
) -> bool:
    """True when (sender, format_hash) matches any entry in the user skiplist."""
    if not skiplist:
        return False
    sender = normalize_sender(email.sender)
    format_hash = compute_format_hash(email.subject, email.body_text)
    for entry in skiplist:
        if normalize_sender(entry.sender) == sender and entry.format_hash == format_hash:
            return True
    return False


def _build_classifier_agent() -> Agent:
    return Agent(
        name="order_confirmation_classifier",
        model=MODEL_NAME,
        instruction=CLASSIFIER_SYSTEM_PROMPT,
        output_schema=_LLMClassification,
        tools=[],
    )


def _format_email(email: EmailForClassification) -> str:
    payload = {
        "sender": email.sender,
        "subject": email.subject,
        "snippet": email.snippet,
        "body_text": email.body_text[:MAX_BODY_CHARS],
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


def _parse_classification_output(raw_output: str | None) -> ClassificationResult:
    if not raw_output or not raw_output.strip():
        raise ClassifierError("Classifier returned empty output")

    try:
        payload = json.loads(_strip_json_fence(raw_output))
    except json.JSONDecodeError as exc:
        raise ClassifierError("Classifier returned malformed JSON") from exc

    try:
        llm_result = _LLMClassification.model_validate(payload)
    except ValidationError:
        raise
    except Exception as exc:
        raise ClassifierError("Classifier returned an invalid payload") from exc

    return ClassificationResult(
        is_order=llm_result.is_order,
        confidence=llm_result.confidence,
    )


async def _maybe_await[T](value: T) -> T:
    if inspect.isawaitable(value):
        return await value
    return value


async def _run_classifier_agent(email: EmailForClassification) -> str | None:
    session_service = InMemorySessionService()
    session_id = f"classify-{uuid4()}"
    user_id = "ingest-classifier"

    await _maybe_await(
        session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
    )

    runner = Runner(
        app_name=APP_NAME,
        agent=_build_classifier_agent(),
        session_service=session_service,
    )
    message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=_format_email(email))],
    )

    final_text: str | None = None
    try:
        async with asyncio.timeout(CLASSIFIER_TIMEOUT_SECONDS):
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
            ):
                if event.is_final_response():
                    final_text = _extract_event_text(event)
    except TimeoutError as exc:
        raise ClassifierError(
            f"Classifier timed out for user_id={user_id} session_id={session_id}"
        ) from exc

    return final_text


async def classify(
    email: EmailForClassification,
    *,
    skiplist: list[IngestionSkiplistEntry] | None = None,
) -> ClassificationResult:
    """Return whether an email is an order confirmation and the model confidence.

    When `skiplist` contains an entry whose `sender` + `format_hash` match this
    email, the classifier short-circuits with `is_order=False` and does not
    call Gemini — saving the expensive extraction round-trip on repeat
    promotional senders the user has already dismissed (ticket 3.7).
    """

    if _skiplist_match(email, skiplist):
        return ClassificationResult(is_order=False, confidence=1.0, skiplist_hit=True)

    raw_output = await _run_classifier_agent(email)
    return _parse_classification_output(raw_output)
