"""ClaimIt ingest agent — FastAPI entrypoint.

Currently handles:
- /health (Cloud Run liveness)
- /pubsub/gmail-inbound (ticket 4.15: Gmail watch notifications)
- /pubsub/purchase-uploaded (ticket 5.14: receipt uploads → vision
  extraction → finalize)

Both Pub/Sub handlers always return 200 to ack. Pub/Sub's only
retry strategy is "redeliver", and any error that depends on the
contents of a specific message (malformed envelope, missing GCS blob,
deleted purchase) will fail every time — so we log and drop. The
dead-letter policy on each subscription (5 attempts) catches the
class of failures where retries actually help (transient network /
auth flakes); everything else either succeeds or is logged + dropped.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from claimit_mongodb_models import MongoDBClient, PurchaseStatus
from claimit_observability import init_phoenix
from fastapi import Depends, FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .auth import verify_pubsub_oidc
from .extractor import ExtractorError, extract_from_blob
from .finalize import FinalizeError, finalize_purchase_extraction
from .storage import ReceiptObjectMissingError, ReceiptsReader, parse_gs_uri

_log = logging.getLogger(__name__)

# Module-global singletons (set in lifespan, read by handler).
# Pattern mirrors api-gateway/src/deps.py — startup wiring lives in
# `lifespan` so import-time has no GCP/Mongo side effects, which keeps
# unit tests using FastAPI dependency_overrides cheap.
_db: MongoDBClient | None = None
_receipts_reader: ReceiptsReader | None = None


async def get_db() -> MongoDBClient:
    if _db is None:
        raise RuntimeError("MongoDB not initialized")
    return _db


async def get_receipts_reader() -> ReceiptsReader:
    if _receipts_reader is None:
        raise RuntimeError("ReceiptsReader not initialized")
    return _receipts_reader


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global _db, _receipts_reader
    init_phoenix("claimit-ingest-agent")
    # MongoDB + receipts reader are required for the purchase.uploaded
    # handler. They're soft-optional during local dev / test (overridable
    # via dependency_overrides) but failures here in production crash
    # the container at startup rather than 500-ing on the first push.
    mongo_url = os.environ.get("MONGODB_URI")
    if mongo_url:
        _db = MongoDBClient(mongo_url)
    if os.environ.get("RECEIPTS_BUCKET"):
        _receipts_reader = ReceiptsReader()
    yield
    if _db is not None:
        await _db.close()


app = FastAPI(
    title="ClaimIt ingest agent",
    version="0.1.0",
    lifespan=lifespan,
)


class _PubSubMessage(BaseModel):
    """Inner `message` envelope sent by Pub/Sub push.

    Field names use camelCase on the wire; `populate_by_name` lets us
    accept either form so tests don't need to know which convention
    Pub/Sub picked for any given field.
    """

    model_config = ConfigDict(populate_by_name=True)

    data: str
    message_id: str = Field(default="", alias="messageId")
    publish_time: str = Field(default="", alias="publishTime")
    attributes: dict[str, str] = {}


class _PubSubPushBody(BaseModel):
    message: _PubSubMessage
    subscription: str = ""


class _GmailNotification(BaseModel):
    """Decoded payload Gmail publishes to gmail-inbound.

    Reference:
    https://developers.google.com/gmail/api/guides/push#receiving_notifications

    Both fields are always populated by Gmail. `historyId` is the
    starting cursor 4.17 will pass to `users.history.list`.
    """

    emailAddress: str  # noqa: N815 — matches Gmail wire format
    historyId: str  # noqa: N815


def _mask_email(email: str) -> str:
    """Log-safe: 'user@example.com' -> 'u***@example.com'.

    Keeping the first local-part char + the full domain is enough to
    correlate log lines from the same user during oncall while stripping
    enough of the PII that we're not piping inbox addresses into log
    sinks indexed by anyone with project Viewer.
    """
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}" if local else f"***@{domain}"


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + smoke tests."""
    return {"status": "ok", "agent": "ingest"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt ingest agent is running"}


@app.post(
    "/pubsub/gmail-inbound",
    status_code=200,
    dependencies=[Depends(verify_pubsub_oidc)],
)
async def handle_gmail_inbound(request: Request) -> dict[str, str]:
    """Pub/Sub push handler for Gmail new-message notifications.

    Always returns 200 to ack — parse failures and downstream errors get
    logged but do NOT propagate as 5xx, because the only retry strategy
    Pub/Sub has is "redeliver", and a malformed message will fail every
    time. The dead-letter policy (5 attempts) catches genuinely poisoned
    messages; everything else either succeeds or is logged + dropped.

    The history.list / messages.get pipeline is ticket 4.17 — for now we
    just parse and log so we have evidence Pub/Sub is delivering as
    expected once the subscription is live in prod.
    """
    try:
        body = _PubSubPushBody.model_validate(await request.json())
    except Exception as err:
        _log.error("Gmail inbound push: invalid envelope: %s", err)
        return {"status": "error", "reason": "invalid_envelope"}

    try:
        raw_data = base64.b64decode(body.message.data).decode("utf-8")
    except Exception as err:
        _log.error(
            "Gmail inbound push: base64 decode failed (message_id=%s): %s",
            body.message.message_id,
            err,
        )
        return {"status": "error", "reason": "invalid_base64"}

    try:
        payload = _GmailNotification.model_validate(json.loads(raw_data))
    except Exception as err:
        # raw_data[:200] is intentional here — this branch fires only on
        # a parse failure, so we need to see what Gmail actually sent to
        # debug. By contract the payload contains only `emailAddress` +
        # `historyId`; the 200-char cap bounds blast radius if a future
        # schema change adds a larger field.
        _log.error(
            "Gmail inbound push: payload parse failed (message_id=%s, data=%r): %s",
            body.message.message_id,
            raw_data[:200],
            err,
        )
        return {"status": "error", "reason": "invalid_payload"}

    # Mask the email on the happy path so we don't write user inbox
    # addresses into Cloud Logging at info-level on every Gmail
    # notification (one log line per inbound message, indexed by anyone
    # with project Viewer). The error branch above kept the full
    # payload because debugging a parse bug needs the raw bytes; here
    # the masked form is enough to correlate.
    _log.info(
        "Gmail inbound: message_id=%s email=%s history_id=%s",
        body.message.message_id,
        _mask_email(payload.emailAddress),
        payload.historyId,
    )

    # TODO(ticket 4.17): users.history.list since
    # User.gmail_integration.last_processed_message_id (or, on first delivery,
    # gmail_integration.watch_history_id) → messages.get → extractor → write
    # Purchase + publish purchase.ingested.
    return {"status": "ack"}


class _PurchaseUploadedPayload(BaseModel):
    """Decoded payload for the purchase.uploaded Pub/Sub message.

    Mirrors `claimit_pubsub.PurchaseUploadedEvent` but tolerates extra
    fields (`extra="ignore"`) so additive envelope changes from
    api-gateway don't break the handler immediately. The required-field
    set is what's strictly needed to find the purchase and read the
    blob.
    """

    model_config = ConfigDict(extra="ignore")

    purchase_id: str
    user_id: str
    receipt_storage_url: str
    content_type: str


@app.post(
    "/pubsub/purchase-uploaded",
    status_code=200,
    dependencies=[Depends(verify_pubsub_oidc)],
)
async def handle_purchase_uploaded(
    request: Request,
    db: MongoDBClient = Depends(get_db),
    receipts_reader: ReceiptsReader = Depends(get_receipts_reader),
) -> dict[str, str]:
    """Pub/Sub push handler for `purchase.uploaded` events (ticket 5.14).

    Flow:
      1. Parse the Pub/Sub envelope + decode the inner JSON payload.
      2. Load the existing sentinel Purchase by id.
      3. IDEMPOTENCY: if status != pending_confirmation, ack and skip
         (the upload→extraction has already run, OR the user already
         confirmed / dismissed). Redeliveries are a no-op.
      4. Read the receipt blob out of GCS via the docs's
         receipt_storage_url. Bucket-mismatch and gs:// parse failures
         drop the message — the upstream invariant (api-gateway only
         writes URIs into the receipts bucket) is what guards against
         arbitrary blob reads.
      5. Run extract_from_blob → finalize_purchase_extraction. Finalize
         publishes purchase.ingested + writes the proactive notification.

    Always returns 200 (see module docstring). Errors are logged with
    enough context to debug from Cloud Logging without piping PII.
    """
    try:
        body = _PubSubPushBody.model_validate(await request.json())
    except Exception as err:
        _log.error("purchase.uploaded push: invalid envelope: %s", err)
        return {"status": "error", "reason": "invalid_envelope"}

    try:
        raw_data = base64.b64decode(body.message.data).decode("utf-8")
    except Exception as err:
        _log.error(
            "purchase.uploaded push: base64 decode failed (message_id=%s): %s",
            body.message.message_id,
            err,
        )
        return {"status": "error", "reason": "invalid_base64"}

    try:
        payload = _PurchaseUploadedPayload.model_validate(json.loads(raw_data))
    except (json.JSONDecodeError, ValidationError) as err:
        # raw_data is bounded by upstream PurchaseUploadedEvent size
        # (tiny — four string fields), so the 200-char cap is generous
        # enough to debug a malformed payload without dumping PII.
        _log.error(
            "purchase.uploaded push: payload parse failed (message_id=%s, data=%r): %s",
            body.message.message_id,
            raw_data[:200],
            err,
        )
        return {"status": "error", "reason": "invalid_payload"}

    try:
        purchase_id = UUID(payload.purchase_id)
    except ValueError as err:
        _log.error(
            "purchase.uploaded push: invalid purchase_id=%r message_id=%s err=%s",
            payload.purchase_id,
            body.message.message_id,
            err,
        )
        return {"status": "error", "reason": "invalid_purchase_id"}

    purchase = await db.get_purchase(purchase_id)
    if purchase is None:
        _log.warning(
            "purchase.uploaded push: purchase not found purchase_id=%s message_id=%s",
            purchase_id,
            body.message.message_id,
        )
        return {"status": "error", "reason": "purchase_not_found"}

    if purchase.status != PurchaseStatus.PENDING_CONFIRMATION.value:
        # Idempotency: a redelivery (or a race where the user beat the
        # handler to /confirm) shows up here. Ack quietly so the
        # dead-letter doesn't trigger.
        _log.info(
            "purchase.uploaded push: skipping already-processed purchase_id=%s status=%s",
            purchase_id,
            purchase.status,
        )
        return {"status": "ack", "reason": "already_processed"}

    # Trust the doc's receipt_storage_url over the event payload — the
    # doc is the canonical record and api-gateway wrote it transactionally
    # with the upload. The event is fast-path information.
    storage_url = purchase.receipt_storage_url or payload.receipt_storage_url
    if not storage_url:
        _log.error(
            "purchase.uploaded push: no receipt_storage_url purchase_id=%s",
            purchase_id,
        )
        return {"status": "error", "reason": "no_receipt_url"}

    try:
        bucket, blob_path = parse_gs_uri(storage_url)
    except ValueError as err:
        _log.error(
            "purchase.uploaded push: malformed receipt URI purchase_id=%s url=%r err=%s",
            purchase_id,
            storage_url,
            err,
        )
        return {"status": "error", "reason": "malformed_receipt_url"}

    if bucket != receipts_reader.bucket_name:
        # Defence-in-depth: refuse to read from any bucket other than
        # the configured RECEIPTS_BUCKET even if our SA happens to have
        # access. Same posture as api-gateway's proxy endpoint.
        _log.error(
            "purchase.uploaded push: bucket mismatch purchase_id=%s uri_bucket=%s expected=%s",
            purchase_id,
            bucket,
            receipts_reader.bucket_name,
        )
        return {"status": "error", "reason": "bucket_mismatch"}

    try:
        blob_data, blob_content_type = await receipts_reader.download(blob_path=blob_path)
    except ReceiptObjectMissingError:
        _log.error(
            "purchase.uploaded push: receipt blob missing purchase_id=%s blob_path=%s",
            purchase_id,
            blob_path,
        )
        return {"status": "error", "reason": "receipt_blob_missing"}

    # Prefer the content-type stored in GCS metadata (set on upload)
    # over the event-payload value. They should match, but if a future
    # api-gateway change tweaks the event without updating storage, the
    # bytes that GCS actually serves are authoritative.
    mime_type = blob_content_type or payload.content_type

    try:
        extracted = await extract_from_blob(data=blob_data, mime_type=mime_type)
    except ValueError as err:
        # Unsupported mime type or empty blob — these can't succeed on
        # retry. Log + ack.
        _log.error(
            "purchase.uploaded push: extract_from_blob rejected input purchase_id=%s err=%s",
            purchase_id,
            err,
        )
        return {"status": "error", "reason": "extractor_rejected_input"}
    except ExtractorError as err:
        # Timeout / malformed model output / empty model output. Retryable
        # in principle, but a non-200 here would just retry the entire
        # GCS read + Gemini call; the dead-letter (5 attempts) covers
        # the rare transient case better than a synchronous 5xx loop.
        _log.error(
            "purchase.uploaded push: extractor failed purchase_id=%s err=%s",
            purchase_id,
            err,
        )
        return {"status": "error", "reason": "extractor_failed"}

    try:
        await finalize_purchase_extraction(db=db, purchase_id=purchase_id, extracted=extracted)
    except FinalizeError as err:
        _log.error(
            "purchase.uploaded push: finalize failed purchase_id=%s err=%s",
            purchase_id,
            err,
        )
        return {"status": "error", "reason": "finalize_failed"}

    _log.info(
        "purchase.uploaded push: extraction applied purchase_id=%s message_id=%s",
        purchase_id,
        body.message.message_id,
    )
    return {"status": "ack"}
