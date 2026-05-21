"""ClaimIt ingest agent — FastAPI entrypoint.

Currently handles:
- /health (Cloud Run liveness)
- /pubsub/gmail-inbound (ticket 4.15: Gmail watch notifications)

The watch handler in 4.15 is intentionally a framework — it verifies OIDC,
parses the Pub/Sub envelope, decodes the Gmail notification payload, and
acks. The actual history.list + messages.get + extractor pipeline is the
4.17 follow-up; this PR only proves the plumbing is correct end-to-end.
"""

from __future__ import annotations

import base64
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from claimit_observability import init_phoenix
from fastapi import Depends, FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field

from .auth import verify_pubsub_oidc

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-ingest-agent")
    yield


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
