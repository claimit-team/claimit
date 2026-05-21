"""ClaimIt ingest agent — FastAPI entrypoint.

Currently handles:
- /health (Cloud Run liveness)
- /pubsub/gmail-inbound (ticket 4.15: Gmail watch notifications)
- /pubsub/purchase.uploaded (ticket 5.14: receipt uploads → vision
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
from google.cloud import secretmanager
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .auth import verify_pubsub_oidc
from .extractor import ALLOWED_BLOB_MIME_TYPES, ExtractorError, extract_from_blob
from .finalize import FinalizeError, finalize_purchase_extraction
from .renewal import run_renewal_sweep
from .storage import ReceiptObjectMissingError, ReceiptsReader, parse_gs_uri

_log = logging.getLogger(__name__)

# Magic-byte prefixes for the three mime types `extract_from_blob`
# accepts (`ALLOWED_BLOB_MIME_TYPES`). Used as a last-resort sniff in
# `_select_mime_type` when neither GCS metadata nor the event payload
# carry a usable content-type — that combination is a data-quality
# signal worth surfacing but should not silently drop an otherwise
# well-formed upload.
_MIME_MAGIC_PREFIXES: tuple[tuple[bytes, str], ...] = (
    (b"%PDF-", "application/pdf"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


def _normalize_mime(value: str | None) -> str | None:
    """Strip parameters + whitespace, lowercase, and drop octet-stream.

    GCS returns the bytes' content_type as stored. Upload code normally
    writes a known mime, but a future client SDK quirk could land
    `application/octet-stream` (or a `; charset=` suffix) here. Treat
    octet-stream as "unknown" so the caller can fall through to other
    signals; preserve the bare type so a stray `application/pdf;
    charset=binary` still routes to the pdf branch.
    """
    if not value:
        return None
    bare = value.split(";", 1)[0].strip().lower()
    if not bare or bare == "application/octet-stream":
        return None
    return bare


def _sniff_mime(data: bytes) -> str | None:
    """Detect mime from leading magic bytes. Returns None when no match.

    Limited to the three types extraction can handle so we never paper
    over genuinely unsupported uploads.
    """
    for prefix, mime in _MIME_MAGIC_PREFIXES:
        if data.startswith(prefix):
            return mime
    return None


def _select_mime_type(
    *,
    blob_content_type: str | None,
    event_content_type: str | None,
    data: bytes,
    purchase_id: UUID,
) -> str:
    """Pick the most authoritative mime type for `extract_from_blob`.

    Priority order:
      1. GCS-reported content-type when it's a known (non-octet-stream)
         mime. Whatever GCS actually serves is what Gemini will read.
      2. Event-payload content-type — the api-gateway upload route
         validates this against the same PDF/PNG/JPG allow-list before
         publishing, so it's a strong second signal.
      3. Magic-byte sniff on the first bytes of the blob — covers the
         rare case where both metadata sources have been corrupted to
         octet-stream but the bytes are still a valid receipt.

    Logs a WARNING when sniffing is the only signal (so a slow
    metadata regression is visible in logs without spamming the
    happy path), and returns `application/octet-stream` only when
    every signal fails — `extract_from_blob` will then reject the
    message via `ValueError`, the handler logs + acks, and the
    dead-letter / DLQ subscription is the right surface for those.
    """
    blob_normalized = _normalize_mime(blob_content_type)
    if blob_normalized in ALLOWED_BLOB_MIME_TYPES:
        return blob_normalized
    event_normalized = _normalize_mime(event_content_type)
    if event_normalized in ALLOWED_BLOB_MIME_TYPES:
        return event_normalized
    sniffed = _sniff_mime(data)
    if sniffed is not None:
        _log.warning(
            "purchase.uploaded push: GCS + event content-type unusable; "
            "recovered via magic-byte sniff purchase_id=%s sniffed=%s "
            "blob_content_type=%r event_content_type=%r",
            purchase_id,
            sniffed,
            blob_content_type,
            event_content_type,
        )
        return sniffed
    # Truly unknown bytes: hand octet-stream to `extract_from_blob`,
    # which raises ValueError → handler returns
    # `extractor_rejected_input`. Dropping with a log is the right
    # outcome; retries cannot help.
    return "application/octet-stream"


# Module-global singletons (set in lifespan, read by handler).
# Pattern mirrors api-gateway/src/deps.py — startup wiring lives in
# `lifespan` so import-time has no GCP/Mongo side effects, which keeps
# unit tests using FastAPI dependency_overrides cheap.
_db: MongoDBClient | None = None
_receipts_reader: ReceiptsReader | None = None
_sm_client: secretmanager.SecretManagerServiceClient | None = None


async def get_db() -> MongoDBClient:
    if _db is None:
        raise RuntimeError("MongoDB not initialized")
    return _db


async def get_receipts_reader() -> ReceiptsReader:
    if _receipts_reader is None:
        raise RuntimeError("ReceiptsReader not initialized")
    return _receipts_reader


async def get_sm_client() -> secretmanager.SecretManagerServiceClient:
    """Secret Manager client used by the 4.16 renewal cron to load each
    user's gmail-refresh-token secret. Cheap to construct (lazy gRPC
    channel, ADC-resolved), but cheaper still to hold a single instance
    across the sweep."""
    if _sm_client is None:
        raise RuntimeError("Secret Manager client not initialized")
    return _sm_client


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global _db, _receipts_reader, _sm_client
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
    # Secret Manager client is unconditionally needed by the 4.16
    # /renew-watches handler. Always construct (no env-var gate) — ADC
    # is available in every Cloud Run + local-dev configuration, and
    # the lazy gRPC channel means construction has no side effects we'd
    # want to defer.
    _sm_client = secretmanager.SecretManagerServiceClient()
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


@app.post("/renew-watches")
async def renew_watches(
    db: MongoDBClient = Depends(get_db),
    sm_client: secretmanager.SecretManagerServiceClient = Depends(get_sm_client),
) -> dict[str, int]:
    """Daily Gmail watch renewal sweep (ticket 4.16).

    Invoked by Cloud Scheduler at 03:00 UTC. Auth is platform-level —
    Cloud Run's `run.invoker` grant on the `pubsub-pusher` SA gates
    the request; this handler has no app-level OIDC check (same posture
    as monitor-agent's `/cron`). The Scheduler OIDC token's audience
    is the bare service URL (`module.ingest_agent.service_url`) rather
    than the full push endpoint, so the 4.15 Pub/Sub-push verifier
    pattern wouldn't apply cleanly here even if we wanted it.

    Returns the counters dict from `run_renewal_sweep` so the workflow
    + Cloud Logging have visibility into what each run did.
    """
    return await run_renewal_sweep(db, sm_client)


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
    "/pubsub/purchase.uploaded",
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

    # Pick the strongest signal of what these bytes actually are. See
    # `_select_mime_type` for the exact priority chain — the short
    # version is: GCS metadata > event payload > magic-byte sniff >
    # octet-stream (which `extract_from_blob` will reject). Reusing the
    # helper keeps the priority + warning behaviour testable in
    # isolation without spinning up the whole FastAPI app.
    mime_type = _select_mime_type(
        blob_content_type=blob_content_type,
        event_content_type=payload.content_type,
        data=blob_data,
        purchase_id=purchase_id,
    )

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
    except Exception:
        # Defence-in-depth: `finalize_purchase_extraction` also calls
        # `publish_event` (network/Pub/Sub) and constructs Pydantic
        # event models from a doc loaded out of Mongo. A transient
        # broker outage, a legacy doc with an `ingestion_source` value
        # that doesn't round-trip through `PurchaseIngestedEvent`, or
        # any other unexpected exception would otherwise leak as a 5xx
        # and break the module-level "always returns 200 to ack"
        # contract (see file docstring) — Pub/Sub would then
        # redeliver until the DLQ fills with messages we cannot
        # actually progress on. Idempotency upstream (the
        # `status != PENDING_CONFIRMATION` short-circuit) makes a
        # redelivery a no-op anyway, so 200 here is the right surface.
        # `exc_info=True` keeps the full traceback in Cloud Logging
        # for triage.
        _log.exception(
            "purchase.uploaded push: finalize raised unexpected exception purchase_id=%s",
            purchase_id,
        )
        return {"status": "error", "reason": "finalize_unexpected_exception"}

    _log.info(
        "purchase.uploaded push: extraction applied purchase_id=%s message_id=%s",
        purchase_id,
        body.message.message_id,
    )
    return {"status": "ack"}
