"""ClaimIt monitor agent — FastAPI entrypoint."""

import base64
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from claimit_mongodb_models import MongoDBClient
from claimit_observability import init_phoenix
from claimit_pubsub import PurchaseIngestedEvent
from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field

from .cron import run_cron
from .resolver import RESOLVABLE_PLATFORMS, _resolve_and_persist

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-monitor-agent")
    app.state.db = MongoDBClient()
    try:
        yield
    finally:
        await app.state.db.close()


app = FastAPI(
    title="ClaimIt monitor agent",
    version="0.1.0",
    lifespan=lifespan,
)


class _PubSubMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data: str
    message_id: str = Field(default="", alias="messageId")
    attributes: dict[str, str] = {}


class _PubSubPushBody(BaseModel):
    message: _PubSubMessage
    subscription: str = ""


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + smoke tests."""
    return {"status": "ok", "agent": "monitor"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt monitor agent is running"}


@app.post("/cron")
async def cron(request: Request) -> dict[str, int]:
    """Cadence-based price-monitoring sweep.

    Invoked by Cloud Scheduler every 15 minutes (see `infra/terraform/scheduler.tf`).
    Always returns 200 with a counter summary — per-purchase errors are counted,
    not raised, to keep one bad adapter from poisoning the whole run.
    """
    return await run_cron(request.app.state.db)


@app.post("/pubsub/purchase.ingested", status_code=200)
async def handle_purchase_ingested(request: Request) -> dict[str, str]:
    """Resolve a product URL right after a purchase enters monitoring.

    Activates the `purchase.ingested-monitor-agent-sub` subscription. For the
    resolvable retail platforms (Best Buy / Target) whose price adapters need
    an on-host `product_url`, this finds + persists one via ScraperAPI and
    notifies the user — so the cron price sweep has everything it needs.

    Always returns 200 to ack — errors are logged, never raised via 5xx, to
    avoid Pub/Sub retry storms (parity with claim-agent `/pubsub/price.dropped`).
    """
    # TODO(post-hackathon): add Pub/Sub push authentication (OIDC token verification)
    try:
        body = _PubSubPushBody.model_validate(await request.json())
        raw_data = base64.b64decode(body.message.data).decode("utf-8")
        event = PurchaseIngestedEvent.model_validate_json(raw_data)

        if event.status != "monitoring" or event.platform not in RESOLVABLE_PLATFORMS:
            return {"status": "skipped", "reason": "not_resolvable"}

        db: MongoDBClient = request.app.state.db
        purchase = await db.get_purchase(event.purchase_id)
        if purchase is None:
            _log.warning("resolver.purchase_not_found purchase_id=%s", event.purchase_id)
            return {"status": "error", "reason": "purchase_not_found"}
        if purchase.status != "monitoring" or not purchase.product_name:
            return {"status": "skipped", "reason": "not_resolvable"}

        await _resolve_and_persist(db, purchase, notify_unresolved=True)
        return {"status": "ok"}
    except Exception:
        _log.exception("resolver.pubsub_handler_error")
        return {"status": "error", "reason": "handler_exception"}
