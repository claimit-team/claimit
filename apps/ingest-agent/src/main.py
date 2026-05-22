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

from claimit_gmail import WatchRegistrationError, exchange_refresh_for_access
from claimit_mongodb_models import (
    MongoDBClient,
    Purchase,
    PurchaseStatus,
    User,
    compute_format_hash,
)
from claimit_observability import init_phoenix
from fastapi import Depends, FastAPI, Request
from google.cloud import secretmanager
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .auth import verify_pubsub_oidc
from .classifier import classify
from .dedup import hash_receipt
from .extractor import (
    ALLOWED_BLOB_MIME_TYPES,
    ExtractorError,
    extract_from_blob,
    extract_from_email,
)
from .finalize import (
    FinalizeError,
    finalize_purchase_extraction,
    finalize_purchase_extraction_failure,
)
from .gmail_api import GmailApiError, GmailAuthError, history_list, messages_get
from .gmail_parser import GmailParseError, parse_gmail_message
from .gmail_purchase_factory import insert_gmail_sentinel_purchase
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


# Per-push hard cap on the number of Gmail messages this handler will
# process inline. Each message costs ~10-25s end-to-end (Gmail API +
# classifier Gemini call + extractor Gemini call + Mongo writes), and
# Pub/Sub's ack deadline on `gmail-inbound-to-ingest` is 60s. Capping at
# 5 keeps the worst case under the deadline. Messages beyond the cap
# are lost in this first cut — the cursor advances to the push's
# historyId so the next push picks up from there. A follow-up ticket
# can refine this to per-record cursor advancement so nothing gets
# dropped silently.
_GMAIL_INBOUND_PROCESS_CAP = 5


async def _process_gmail_inbound(
    db: MongoDBClient,
    sm_client: secretmanager.SecretManagerServiceClient,
    email_address: str,
    history_id: str,
) -> None:
    """Drive the Gmail ingest pipeline for one push delivery.

    Flow:
      1. Look up the User by `gmail_integration.connected_email`.
      2. Pick the starting cursor (`last_processed_history_id` or, on
         first delivery, `watch_history_id`).
      3. Mint a short-lived OAuth access token.
      4. Call `users.history.list?startHistoryId=<cursor>` — first page
         only.
      5. Flatten `messagesAdded` across the returned history records;
         cap at `_GMAIL_INBOUND_PROCESS_CAP`.
      6. For each message: fetch via `users.messages.get`, parse to
         `EmailForExtraction`, classify, dedup by `receipt_hash`,
         insert sentinel Purchase, run `extract_from_email`,
         `finalize_purchase_extraction` (or rescue on extract
         failure).
      7. Advance `last_processed_history_id` to the push's historyId.

    Never raises out — all per-message errors are caught + logged + the
    sweep moves on. The handler wraps the whole thing in another
    try/except as defense-in-depth so anything that escapes here
    (e.g., Mongo network failure) still results in a 200 ack.
    """
    # 1. User lookup.
    user = await db.find_one("users", {"gmail_integration.connected_email": email_address}, User)
    if user is None:
        _log.warning(
            "gmail.user_not_found email=%s history_id=%s",
            _mask_email(email_address),
            history_id,
        )
        return

    # 2. Starting cursor. `last_processed_history_id` is the steady-
    # state value the previous run of this handler advanced to.
    # `watch_history_id` is what 4.15 wrote when the watch was first
    # registered — the fallback for the very first push.
    start_history_id = (
        user.gmail_integration.last_processed_history_id or user.gmail_integration.watch_history_id
    )
    if start_history_id is None:
        _log.warning(
            "gmail.no_starting_cursor user_id=%s — watch may not be registered yet",
            user.id,
        )
        return

    # 3. Mint an access token. `exchange_refresh_for_access` raises
    # `WatchRegistrationError` on any failure mode (missing OAuth
    # client env, Secret Manager unreachable, refresh-token grant
    # rejected by Google). All of these are terminal for this push —
    # nothing the handler can retry inline, the cursor doesn't
    # advance, and the next push gets the same start_history_id.
    try:
        access_token = await exchange_refresh_for_access(sm_client, user)
    except WatchRegistrationError as err:
        _log.warning(
            "gmail.token_mint_failed user_id=%s reason=%s",
            user.id,
            err.terminal_message,
        )
        return

    # 4. history.list — first page only (the _GMAIL_INBOUND_PROCESS_CAP
    # would clip anything past the page anyway in this first cut).
    try:
        history_response = await history_list(access_token, start_history_id)
    except GmailAuthError as err:
        # The token we just minted got a 401 — likely a stale-grant
        # race (user revoked between exchange_refresh and history.list).
        # Same outcome as a hard token-mint failure: no cursor
        # advance, surface in logs.
        _log.warning(
            "gmail.history_list_auth_failed user_id=%s reason=%s",
            user.id,
            err,
        )
        return
    except GmailApiError as err:
        _log.warning(
            "gmail.history_list_failed user_id=%s status=%d message=%s",
            user.id,
            err.status_code,
            err.message,
        )
        return

    # 5. Flatten messagesAdded across history records.
    message_ids: list[str] = []
    for record in history_response.get("history") or []:
        for added in record.get("messagesAdded") or []:
            msg_id = added.get("message", {}).get("id")
            if msg_id:
                message_ids.append(msg_id)

    if not message_ids:
        _log.info(
            "gmail.no_new_messages user_id=%s start_history_id=%s push_history_id=%s",
            user.id,
            start_history_id,
            history_id,
        )
        # Still advance the cursor — an empty history.list response means
        # Gmail has nothing new for us relative to start_history_id, but
        # the push's historyId is a more recent watermark so the next
        # push starts from a closer point.
        await db.partial_update(
            "users",
            user.id,
            {"gmail_integration.last_processed_history_id": history_id},
        )
        return

    batch = message_ids[:_GMAIL_INBOUND_PROCESS_CAP]
    overflow = len(message_ids) - len(batch)
    if overflow > 0:
        _log.warning(
            "gmail.over_cap user_id=%s total=%d processing=%d remaining=%d",
            user.id,
            len(message_ids),
            len(batch),
            overflow,
        )

    # 6. Per-message processing. Each iteration's failures are
    # contained so a single bad message doesn't strand the rest of
    # the batch.
    processed = ingested = skipped_not_order = skipped_duplicate = failed = 0
    for msg_id in batch:
        try:
            # 6a. Fetch the full message envelope.
            try:
                msg = await messages_get(access_token, msg_id)
            except (GmailApiError, GmailAuthError) as err:
                _log.warning(
                    "gmail.messages_get_failed user_id=%s msg_id=%s err=%s",
                    user.id,
                    msg_id,
                    err,
                )
                failed += 1
                continue

            # 6b. Parse to EmailForExtraction. GmailParseError is
            # structural — same delivery would always fail this way.
            try:
                email = parse_gmail_message(msg, user_id=user.id)
            except GmailParseError as err:
                _log.warning(
                    "gmail.parse_failed user_id=%s msg_id=%s err=%s",
                    user.id,
                    msg_id,
                    err,
                )
                failed += 1
                continue

            # 6c. Classify. Non-order → skip (no sentinel insert).
            # Skiplist hit means "user already dismissed this sender's
            # format" (ticket 3.7); also counts as not-order.
            classification = classify(email, skiplist=user.ingestion_skiplist)
            if not classification.is_order:
                _log.info(
                    "gmail.classified_not_order user_id=%s msg_id=%s skiplist_hit=%s confidence=%s",
                    user.id,
                    msg_id,
                    classification.skiplist_hit,
                    classification.confidence,
                )
                skipped_not_order += 1
                continue

            # 6d. Dedup. Same email could have been processed via a
            # prior push (Pub/Sub redelivery, watch re-registration
            # window overlap, …). receipt_hash is computed from the
            # normalized email body so the same Gmail message id and
            # the same body content both produce the same hash.
            receipt_hash = hash_receipt(email.body_text)
            existing = await db.find_one(
                "purchases",
                {"user_id": user.id, "receipt_hash": receipt_hash},
                Purchase,
            )
            if existing is not None:
                _log.info(
                    "gmail.duplicate_receipt user_id=%s msg_id=%s existing_purchase_id=%s",
                    user.id,
                    msg_id,
                    existing.id,
                )
                skipped_duplicate += 1
                continue

            # 6e. Insert sentinel.
            format_hash = compute_format_hash(email.sender, email.body_text)
            purchase_id = await insert_gmail_sentinel_purchase(
                db=db,
                user_id=user.id,
                email=email,
                receipt_hash=receipt_hash,
                format_hash=format_hash,
            )

            # 6f. Run Gemini extraction. On ANY failure (timeout,
            # malformed model output, validation error, etc.), call
            # the rescue helper so the sentinel doesn't sit at
            # overall_min=0.0 forever — the FE confirm loader treats
            # that as "still analyzing" and would spin indefinitely.
            try:
                extracted = await extract_from_email(email)
            except Exception:
                _log.exception(
                    "gmail.extract_failed user_id=%s msg_id=%s purchase_id=%s — calling rescue",
                    user.id,
                    msg_id,
                    purchase_id,
                )
                try:
                    await finalize_purchase_extraction_failure(db=db, purchase_id=purchase_id)
                except Exception:
                    _log.exception(
                        "gmail.rescue_failed user_id=%s msg_id=%s purchase_id=%s",
                        user.id,
                        msg_id,
                        purchase_id,
                    )
                failed += 1
                continue

            # 6g. Finalize — partial_update the sentinel with the
            # extracted fields, publish purchase.ingested, write the
            # low_confidence_extract NotificationEvent if status =
            # pending_confirmation. FinalizeError here means the doc
            # is gone OR was partial-updated; either way calling the
            # rescue would double-clobber, so we just log.
            try:
                await finalize_purchase_extraction(
                    db=db, purchase_id=purchase_id, extracted=extracted
                )
                ingested += 1
            except FinalizeError as err:
                _log.warning(
                    "gmail.finalize_failed user_id=%s msg_id=%s purchase_id=%s err=%s",
                    user.id,
                    msg_id,
                    purchase_id,
                    err,
                )
                failed += 1
                continue
        except Exception:
            # Defense-in-depth: anything we didn't anticipate (e.g.,
            # Mongo network blip during the dedup find_one) still
            # counts as a failure but doesn't take the batch down.
            _log.exception(
                "gmail.message_processing_unexpected_error user_id=%s msg_id=%s",
                user.id,
                msg_id,
            )
            failed += 1
            continue
        finally:
            processed += 1

    # 7. Advance cursor. Per the plan, first cut uses the push's
    # historyId as the new cursor (Gmail's "latest as of when this
    # push fired" watermark). Messages beyond the N=5 cap are lost
    # in this iteration — a follow-up ticket can switch to
    # per-record advancement to avoid that.
    try:
        await db.partial_update(
            "users",
            user.id,
            {"gmail_integration.last_processed_history_id": history_id},
        )
    except Exception:
        _log.exception(
            "gmail.cursor_advance_failed user_id=%s history_id=%s",
            user.id,
            history_id,
        )

    _log.info(
        "gmail.batch_complete user_id=%s processed=%d ingested=%d "
        "skipped_not_order=%d skipped_duplicate=%d failed=%d "
        "overflow=%d new_cursor=%s",
        user.id,
        processed,
        ingested,
        skipped_not_order,
        skipped_duplicate,
        failed,
        overflow,
        history_id,
    )


@app.post(
    "/pubsub/gmail-inbound",
    status_code=200,
    dependencies=[Depends(verify_pubsub_oidc)],
)
async def handle_gmail_inbound(
    request: Request,
    db: MongoDBClient = Depends(get_db),
    sm_client: secretmanager.SecretManagerServiceClient = Depends(get_sm_client),
) -> dict[str, str]:
    """Pub/Sub push handler for Gmail new-message notifications.

    Always returns 200 to ack — parse failures and downstream errors get
    logged but do NOT propagate as 5xx, because the only retry strategy
    Pub/Sub has is "redeliver", and a malformed message will fail every
    time. The dead-letter policy (5 attempts) catches genuinely poisoned
    messages; everything else either succeeds or is logged + dropped.

    Once the envelope is parsed, the actual ingest work — user lookup,
    history.list, messages.get, classify, extract, finalize, cursor
    advance — lives in `_process_gmail_inbound` so the handler stays
    focused on the Pub/Sub-shaped concerns (envelope parsing, ack
    discipline) and the orchestration is unit-testable in isolation.
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

    # Drive the ingest pipeline. `_process_gmail_inbound` is responsible
    # for its own error containment — every per-message failure is
    # logged and the sweep moves on. We still wrap the call here as
    # belt-and-suspenders so anything that escapes (e.g., a Mongo
    # connection failure on the very first find_one) still returns 200.
    try:
        await _process_gmail_inbound(
            db=db,
            sm_client=sm_client,
            email_address=payload.emailAddress,
            history_id=payload.historyId,
        )
    except Exception:
        _log.exception(
            "gmail.process_unexpected_error message_id=%s email=%s history_id=%s",
            body.message.message_id,
            _mask_email(payload.emailAddress),
            payload.historyId,
        )
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


async def _rescue_extraction_failure(db: MongoDBClient, purchase_id: UUID, *, reason: str) -> None:
    """Wrap `finalize_purchase_extraction_failure` with structured logging.

    The rescue path is best-effort: if writing the partial_update itself
    raises (Mongo blip, transient connection error, …), we LOG and let
    the handler ack so the Pub/Sub message doesn't get redelivered into
    the same failure mode. The doc stays in its sentinel state on a
    rescue failure — which is the SAME state it would have been in
    before this code existed, so we're not making anything worse on
    the second-failure path.

    `handler.extraction_failed_doc_rescued` is the load-bearing log
    fingerprint: a Cloud Logging filter on this string + a counter
    derived from it is the regression-alarm primitive — any non-zero
    rate on this counter under normal traffic means the genai root
    cause has regressed and we are silently degrading every upload to
    manual-fill.
    """
    try:
        await finalize_purchase_extraction_failure(db=db, purchase_id=purchase_id)
        _log.warning(
            "handler.extraction_failed_doc_rescued purchase_id=%s reason=%s",
            purchase_id,
            reason,
        )
    except Exception:
        _log.exception(
            "handler.extraction_failed_doc_rescue_raised purchase_id=%s reason=%s",
            purchase_id,
            reason,
        )


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
        # retry. Log + ack. Also nudge the doc's overall_min off zero so
        # the FE confirm form opens to manual-fill instead of spinning
        # forever on "Analyzing…" — same rescue posture as the
        # ExtractorError branch below.
        _log.error(
            "purchase.uploaded push: extract_from_blob rejected input purchase_id=%s err=%s",
            purchase_id,
            err,
        )
        await _rescue_extraction_failure(db, purchase_id, reason="extractor_rejected_input")
        return {"status": "error", "reason": "extractor_rejected_input"}
    except ExtractorError as err:
        # Timeout / malformed model output / empty model output. Retryable
        # in principle, but a non-200 here would just retry the entire
        # GCS read + Gemini call; the dead-letter (5 attempts) covers
        # the rare transient case better than a synchronous 5xx loop.
        # Rescue the doc so the user reaches the manual-fill form.
        _log.error(
            "purchase.uploaded push: extractor failed purchase_id=%s err=%s",
            purchase_id,
            err,
        )
        await _rescue_extraction_failure(db, purchase_id, reason="extractor_failed")
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
