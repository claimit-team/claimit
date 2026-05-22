"""Sentinel Purchase doc factory for the 4.17 Gmail ingest path.

The Gmail path mirrors the 5.14 upload path's "insert sentinel → finalize"
shape: insert a `pending_confirmation` Purchase doc with placeholder
field values, then call `finalize_purchase_extraction` which fills in
the extracted fields via `partial_update`. The seam in `finalize.py`
explicitly expects this — `finalize_purchase_extraction_failure` even
uses `extraction_confidence.overall_min == 0.0` as the "this sentinel
hasn't been finalized yet" discriminator.

Why a separate module rather than borrowing from api-gateway:
- api-gateway's `_UPLOAD_PURCHASE_DEFAULTS` (services/purchases.py:88)
  is the upload sentinel's source of truth. Importing it from ingest-
  agent would create a reverse dep from a backend service into the
  BFF. Cheaper to duplicate the defaults dict here, with a comment
  pointing at the upstream to encourage joint maintenance.
- Gmail's identity field set differs from upload's: we have a real
  `sender` (the email From header — populated here so Erdun's
  finalize amendment can pick it up via `get_purchase`), real
  `receipt_hash` (computed from email body, not the upload's
  placeholder sentinel), real `format_hash`, and `receipt_storage_url=None`
  (Gmail first cut doesn't archive the raw email to GCS).

What this factory does NOT do:
- No dedup check. The handler runs `db.find_one` against `receipt_hash`
  upstream so a duplicate Gmail delivery doesn't create a second
  sentinel. Centralizing dedup in the handler keeps the factory pure.
- No NotificationEvent / Pub/Sub side effects. Those fire from
  `finalize_purchase_extraction` after the partial_update lands.
- No error handling beyond what `db.insert_one` raises (Mongo network
  failure, validation rejection, etc.). The handler decides how to
  surface those.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from claimit_mongodb_models import (
    Category,
    ClaimType,
    IngestionSource,
    MongoDBClient,
    Platform,
    Purchase,
    PurchaseDateBasis,
    PurchaseStatus,
)
from claimit_mongodb_models.purchase import ExtractionConfidence

from .extractor import EmailForExtraction

_log = logging.getLogger(__name__)


# Mirror of api-gateway's `_UPLOAD_PURCHASE_DEFAULTS` in services/purchases.py.
# These are the sentinel values for the fields Gemini extraction will fill
# in via `finalize_purchase_extraction` → `partial_update`. Duplicated here
# to keep the upload and gmail sentinel insert flows independently
# refactorable; if either side adds a Purchase field, BOTH dicts need an
# entry until extraction provides the value.
#
# Validation constraints worth knowing about:
#   - price_paid is `Field(gt=0)` on Purchase. 0.01 is the smallest valid
#     positive float that satisfies the constraint until extraction lands.
#   - product_name / product_id / order_id are `str` (non-nullable). Empty
#     string is the only viable sentinel — null would fail validation.
_GMAIL_PURCHASE_SENTINEL_FIELDS = {
    "platform": Platform.AMAZON,
    "category": Category.RETAIL,
    "product_name": "",
    "product_id": "",
    "product_url": None,
    "variant": None,
    "fare_class": None,
    "room_type": None,
    "bed_type": None,
    "rate_type": None,
    # gt=0 constraint; 0.01 is the smallest passing value.
    "price_paid": 0.01,
    "member_price_at_purchase": None,
    "non_member_price_at_purchase": None,
    "currency": "USD",
    "purchase_date_basis": PurchaseDateBasis.ORDER_DATE,
    "order_id": "",
    "member_tier_at_purchase": None,
    "claim_type": ClaimType.SELF_SERVICE,
    "monitoring_cadence_minutes": 360,
}


async def insert_gmail_sentinel_purchase(
    *,
    db: MongoDBClient,
    user_id: UUID,
    email: EmailForExtraction,
    receipt_hash: str,
    format_hash: str,
    now: datetime | None = None,
) -> UUID:
    """Insert a pending_confirmation sentinel Purchase for a Gmail-sourced email.

    Args:
        db: Mongo client.
        user_id: the User UUID this Purchase belongs to. Already
            resolved by the handler from
            `gmail_integration.connected_email`.
        email: the parsed EmailForExtraction from `parse_gmail_message`.
            We pull `sender` from here for the doc.
        receipt_hash: SHA-256 of normalized email body — see
            `extractor.hash_receipt`. The handler computes this once,
            checks for duplicates upstream, and passes through here.
        format_hash: SHA-256 of normalized sender + body — see
            `claimit_mongodb_models.compute_format_hash`. Used by the
            classifier's skiplist matching for any future "dismiss
            this sender's emails" action.
        now: injectable timestamp for deterministic tests.

    Returns the newly-inserted Purchase's id (UUID), suitable to pass
    into `finalize_purchase_extraction(purchase_id=...)` immediately
    after.

    Key invariants:
      - `ingestion_source = IngestionSource.GMAIL` — load-bearing for
        `finalize_purchase_extraction`'s `purchase.ingested` event
        payload (line 220 of finalize.py: it would default to
        `upload_pdf` and publish the wrong event source if we set
        anything else).
      - `extraction_confidence.overall_min = 0.0` — load-bearing for
        `finalize_purchase_extraction_failure`'s discriminator
        (lines 352-358 of finalize.py). Any value > 0.0 means "already
        finalized, don't clobber". Match the upload sentinel exactly.
      - `sender = email.sender` — populated here so Erdun's amendment
        to finalize's `low_confidence_extract` NotificationEvent
        (adding `sender` to the data payload) can read it via
        `get_purchase` without any 4.17-side coordination.
    """
    timestamp = now or datetime.now(UTC)
    purchase_id = uuid4()

    purchase = Purchase(
        id=purchase_id,
        user_id=user_id,
        status=PurchaseStatus.PENDING_CONFIRMATION,
        ingestion_source=IngestionSource.GMAIL,
        receipt_storage_url=None,
        receipt_hash=receipt_hash,
        format_hash=format_hash,
        sender=email.sender,
        # purchase_date / window_expires get overwritten by
        # finalize_purchase_extraction. The sentinel uses `now` for
        # both so the Purchase model validates (non-nullable datetimes)
        # without leaking a misleading default into the dashboard if
        # extraction never lands — the FE filters on `status` not on
        # `purchase_date`, so a `purchase_date == ingested_at`
        # sentinel is invisible.
        purchase_date=timestamp,
        window_expires=timestamp,
        ingested_at=timestamp,
        updated_at=timestamp,
        extraction_confidence=ExtractionConfidence(
            platform=0.0,
            price=0.0,
            overall_min=0.0,
        ),
        **_GMAIL_PURCHASE_SENTINEL_FIELDS,
    )
    await db.upsert("purchases", purchase_id, purchase)
    _log.info(
        "gmail.sentinel_inserted purchase_id=%s user_id=%s sender=%s",
        purchase_id,
        user_id,
        email.sender,
    )
    return purchase_id
