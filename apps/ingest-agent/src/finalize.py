"""Shared finalize seam for upload + Gmail extraction paths (ticket 5.14).

`finalize_purchase_extraction` applies a Gemini extraction result to an
EXISTING purchase document via `partial_update`. The upload pipeline
(api-gateway writes a sentinel pending_confirmation doc, then publishes
`purchase.uploaded`, then ingest-agent's A5 handler reads the receipt,
calls `extract_from_blob`, and calls THIS helper) is the first caller;
Will's 4.17 Gmail handler will reuse the same seam.

Why this seam is partial-update only:
  - The upload path writes a sentinel doc up-front (so the user can
    navigate to /confirm/:id before extraction finishes). Finalize has
    to UPDATE that doc — a second `insert_one` would create a duplicate
    and break ownership lookups by purchase_id.
  - Raj's existing `ingest_email` path performs `insert_one` and is
    deliberately NOT moved into this helper for 5.14 — keeping the
    email-path tests green outweighs the value of a single insert
    seam right now. The shared piece (status branch, window calc, event
    publish, notification write) is what's factored here; the model
    payload conversion lives next to `_purchase_payload` so both paths
    use the same logic without crossing into orchestration.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from claimit_mongodb_models import (
    MongoDBClient,
    NotificationEntityType,
    NotificationEventType,
    Purchase,
    compute_window_days,
    write_notification_event,
)
from claimit_pubsub import (
    TOPIC_PURCHASE_INGESTED,
    PurchaseIngestedEvent,
    publish_event,
)

from src.extractor import (
    FALLBACK_PRODUCT_ID_CONFIDENCE,
    ExtractedPurchaseFields,
    _confidence_payload,
    _merge_confidence_aggregate,
    _resolve_status,
)

logger = logging.getLogger(__name__)

# Statuses that trigger `purchase.ingested`. Mirrors pipeline.py's
# PUBLISHABLE_STATUSES so downstream subscribers (monitor-agent) see
# the same set of events whether a purchase came from Gmail or upload.
PUBLISHABLE_STATUSES = frozenset({"monitoring", "pending_confirmation"})


class FinalizeError(RuntimeError):
    """Raised when finalize cannot locate the target purchase document."""


def _compute_status_and_confidence(
    extracted: ExtractedPurchaseFields,
) -> tuple[str, dict[str, float | None], str, bool]:
    """Decide initial status + finalize the product_id / confidence payload.

    Mirrors the inline block at the top of `_purchase_payload`. Lifted
    into its own helper so both the email-path insert and the
    upload-path partial_update derive product_id, fallback_used, and
    confidence the same way without cross-importing each other's
    private state machine.
    """
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
    return status, confidence, product_id, fallback_used


def _build_partial_update(
    extracted: ExtractedPurchaseFields,
    *,
    window_days: int,
    now: datetime,
) -> dict[str, Any]:
    """Map an `ExtractedPurchaseFields` to a `partial_update` payload.

    Fields the upload sentinel owns at insert time and that extraction
    SHOULD NOT touch on update:
      _id, user_id, ingestion_source, receipt_storage_url, receipt_hash,
      sender, ingested_at, claim_type, monitoring_cadence_minutes,
      format_hash (the upload path has no email body to format-hash;
      the existing sha256:sentinel placeholder stays in place).

    Everything else carries the extraction result.
    """
    status, confidence, product_id, _fallback_used = _compute_status_and_confidence(extracted)
    return {
        "updated_at": now,
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
        "window_expires": extracted.purchase_date + timedelta(days=window_days),
        "order_id": extracted.order_id,
        "member_tier_at_purchase": extracted.member_tier_at_purchase,
        "status": status,
        "extraction_confidence": confidence,
    }


def _low_confidence_fields(confidence: dict[str, float | None]) -> list[str]:
    """Field names below the 0.95 confidence threshold (master doc §5.1).

    Drives the `low_confidence_extract` proactive notification payload
    on the dashboard / assistant Mode C surface. `overall_min` and
    `price` are aggregates / mirrors and intentionally excluded so the
    user sees actionable field names (e.g. "order_id, purchase_date")
    rather than meta-fields.
    """
    threshold = 0.95
    excluded = {"overall_min", "price"}
    return [
        key
        for key, value in confidence.items()
        if key not in excluded and value is not None and value < threshold
    ]


async def finalize_purchase_extraction(
    *,
    db: MongoDBClient,
    purchase_id: UUID,
    extracted: ExtractedPurchaseFields,
    now: datetime | None = None,
) -> Purchase:
    """Apply Gemini extraction to an existing pending_confirmation purchase.

    Steps:
      1. Look up the existing Purchase. Raise `FinalizeError` if missing.
      2. Look up Policy for `extracted.platform` and compute window_days.
      3. Build the partial_update payload (fields + status + window +
         confidence) and write it.
      4. Publish `purchase.ingested` when status is publishable
         (monitoring or pending_confirmation).
      5. Write the `low_confidence_extract` NotificationEvent when status
         is pending_confirmation — drives the Mode C proactive prompt
         that nudges the user to confirm. entity_id = purchase_id so
         the frontend can route the user back to /confirm/:purchase_id
         directly from the event.

    Idempotency is the CALLER's responsibility (the A5 Pub/Sub handler
    decides whether to call finalize again on a redelivery). Finalize
    itself is naive — a repeated call rewrites the same partial_update
    and may re-publish `purchase.ingested`; subscribers are expected to
    dedupe by event_id.

    Returns the updated `Purchase` so the caller can log / observe the
    final state.
    """
    timestamp = now or datetime.now(UTC)

    purchase = await db.get_purchase(purchase_id)
    if purchase is None:
        raise FinalizeError(f"Purchase {purchase_id} does not exist; cannot finalize.")

    policy = await db.get_policy(extracted.platform)
    if policy is None:
        # Latent data gap. Mirror confirm_purchase's logging and rely on
        # `compute_window_days(None, ...)` returning the 15-day default
        # so the update still produces a sensible (if pessimistic)
        # window. Logging is intentional: any platform reaching here
        # without a Policy row indicates the Platform enum has been
        # widened without the policies collection catching up.
        logger.warning(
            "Finalize: no Policy for platform=%s purchase_id=%s — using default window",
            extracted.platform,
            purchase_id,
        )
    window_days = compute_window_days(
        policy, member_tier_at_purchase=extracted.member_tier_at_purchase
    )

    updates = _build_partial_update(extracted, window_days=window_days, now=timestamp)
    matched = await db.partial_update("purchases", purchase_id, updates, model=Purchase)
    if not matched:
        # Lost the race: purchase was deleted between get_purchase and
        # partial_update. Surface as the same error class — the caller
        # acks and moves on; no event, no notification.
        raise FinalizeError(f"Purchase {purchase_id} deleted between read and partial_update.")

    status = updates["status"]
    confidence = updates["extraction_confidence"]
    user_id = purchase.user_id
    ingestion_source = purchase.ingestion_source or "upload_pdf"

    if status in PUBLISHABLE_STATUSES:
        event = PurchaseIngestedEvent(
            user_id=str(user_id),
            purchase_id=str(purchase_id),
            platform=str(updates["platform"]),
            category=updates["category"],
            status=status,
            ingestion_source=ingestion_source,
            overall_confidence=confidence["overall_min"],
        )
        await publish_event(TOPIC_PURCHASE_INGESTED, event)

    if status == "pending_confirmation":
        low_fields = _low_confidence_fields(confidence)
        await write_notification_event(
            db,
            user_id=str(user_id),
            event_type=NotificationEventType.LOW_CONFIDENCE_EXTRACT,
            entity_type=NotificationEntityType.PURCHASE,
            entity_id=str(purchase_id),
            data={
                "purchase_id": str(purchase_id),
                "low_confidence_fields": low_fields,
                "overall_min": confidence["overall_min"],
            },
        )

    refreshed = await db.get_purchase(purchase_id)
    if refreshed is None:
        # Same lost-race surface as above, but after a successful write
        # — surface so the handler logs + acks. Treat as a finalize
        # failure even though the write went through.
        raise FinalizeError(f"Purchase {purchase_id} disappeared after partial_update completed.")
    # `get_purchase` returns the tolerant variant; cast to the strict
    # Purchase for the return value because finalize ran a strict write
    # (`partial_update(..., model=Purchase)`).
    return Purchase.model_validate(refreshed.model_dump(by_alias=True))


# Safety net for extraction failures. NOT the steady state — every prod
# upload should reach `finalize_purchase_extraction` above with real
# extracted fields. This helper exists so a transient Gemini failure
# (timeout, genai teardown bug, malformed model output, …) does not
# leave the sentinel doc stuck at `overall_min=0.0` forever, which is
# what the FE confirm loader treats as "still analyzing" — without it
# the page would spin indefinitely instead of opening the manual-fill
# form. Watch the `handler.extraction_failed_doc_rescued` counter in
# prod: any non-zero value is a regression alarm even if no user
# complains.

# Field list driving the rescue notification's `low_confidence_fields`.
# These are the fields the FE confirm form lights up with the italic
# "Verify this" placeholder, mirroring the keys the confidence-banner
# inspects. Kept as a module-level constant so the FE / BE field name
# choice has exactly one source of truth on the BE side.
_RESCUE_LOW_CONFIDENCE_FIELDS: list[str] = [
    "product_name",
    "price_paid",
    "purchase_date",
    "order_id",
    "platform",
    "category",
]


async def finalize_purchase_extraction_failure(
    *,
    db: MongoDBClient,
    purchase_id: UUID,
    now: datetime | None = None,
) -> None:
    """Rescue an extraction failure so the FE form opens to manual fill.

    Why this exists as a SEPARATE helper from `finalize_purchase_extraction`:
    finalize takes an `ExtractedPurchaseFields` instance, which the
    Pydantic model rejects unless `product_name` is non-empty,
    `price_paid > 0`, etc. — i.e. a failed extraction CANNOT be funneled
    through finalize because there's no valid `ExtractedPurchaseFields`
    to construct. Rather than weakening the strict model contract, the
    rescue path writes the minimum viable partial_update directly:

      - `extraction_confidence.overall_min = 0.01` (nonzero so the FE
        loader's `overall_min == 0` "still analyzing" guard at
        `confirm-purchase-loader.tsx` exits to the form; below the
        0.95 banner threshold so the "couldn't extract most details"
        copy is accurate).
      - `extraction_confidence.platform = price = 0.0` (these two are
        required `float` fields on `ExtractionConfidence`; setting
        them to zero matches the sentinel value the upload writes).
      - status stays `pending_confirmation` — exactly what the upload
        sentinel already had. No `partial_update` to status. The
        ON-disk doc still has the empty `product_name` / `""` /
        `0.01` sentinel field values the upload wrote.
      - NO `purchase.ingested` Pub/Sub publish. Nothing was actually
        extracted; downstream subscribers (monitor-agent) would have
        nothing to do with this doc — the user must confirm first.
      - DO write the `low_confidence_extract` notification so the FE
        Mode C proactive surface still nudges the user. entity_id =
        purchase_id keeps the dashboard quick-action wired the same
        way as the happy path.

    Returns None — there is no "rescued purchase" worth returning to
    the caller; the handler logs the rescue and acks.
    """
    timestamp = now or datetime.now(UTC)

    purchase = await db.get_purchase(purchase_id)
    if purchase is None:
        # Same surface as finalize's missing-doc case. Caller (the
        # purchase.uploaded handler) is already in an error branch
        # logging the original extractor failure; a missing doc here
        # means upstream cleanup or a delete-race — log and bail
        # without raising so the rescue path never blocks the handler
        # ack contract.
        logger.warning(
            "finalize_purchase_extraction_failure: purchase missing purchase_id=%s",
            purchase_id,
        )
        return

    # Minimal confidence payload: keep `price` / `platform` aligned with
    # the upload sentinel (0.0) and only nudge `overall_min` off zero so
    # the FE's "still analyzing" poll exits. Every other confidence key
    # (order_id, product_name, …) is omitted — the model's optional
    # fields default to None, which is the correct "we didn't measure
    # this" semantic and matches what the banner's null-exclusion logic
    # expects.
    updates: dict[str, Any] = {
        "updated_at": timestamp,
        "extraction_confidence": {
            "platform": 0.0,
            "price": 0.0,
            "overall_min": 0.01,
        },
    }
    matched = await db.partial_update("purchases", purchase_id, updates, model=Purchase)
    if not matched:
        logger.warning(
            "finalize_purchase_extraction_failure: partial_update returned no match purchase_id=%s",
            purchase_id,
        )
        return

    await write_notification_event(
        db,
        user_id=str(purchase.user_id),
        event_type=NotificationEventType.LOW_CONFIDENCE_EXTRACT,
        entity_type=NotificationEntityType.PURCHASE,
        entity_id=str(purchase_id),
        data={
            "purchase_id": str(purchase_id),
            "low_confidence_fields": list(_RESCUE_LOW_CONFIDENCE_FIELDS),
            "overall_min": 0.01,
        },
    )
