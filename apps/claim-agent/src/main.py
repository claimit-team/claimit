"""ClaimIt claim agent — FastAPI entrypoint."""

from __future__ import annotations

import base64
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from claimit_mongodb_models import (
    Claim,
    ClaimOutcome,
    DraftGeneratedBy,
    DraftVersion,
    MongoDBClient,
    Platform,
)
from claimit_observability import init_phoenix
from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field

from .draft.type_a_email import generate_email_draft
from .draft.type_b_chat import generate_chat_script
from .plan import PriceDroppedEvent, plan_claim

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-claim-agent")
    yield


app = FastAPI(
    title="ClaimIt claim agent",
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
    return {"status": "ok", "agent": "claim"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt claim agent is running"}


@app.post("/pubsub/price.dropped", status_code=200)
async def handle_price_dropped(request: Request) -> dict[str, str]:
    """Handle Pub/Sub push for price.dropped events.

    Always returns 200 to ack the message — errors are logged, never retried
    via a 5xx, to prevent Pub/Sub infinite-retry loops.
    """
    try:
        body = _PubSubPushBody.model_validate(await request.json())
        raw_data = base64.b64decode(body.message.data).decode("utf-8")
        event = PriceDroppedEvent.model_validate_json(raw_data)

        db = MongoDBClient()
        claim_plan = await plan_claim(event, db)

        if claim_plan.draft_generator not in ("type_a_email", "type_b_chat"):
            _log.info("Skipping unsupported generator %s", claim_plan.draft_generator)
            return {"status": "skipped", "reason": claim_plan.draft_generator}

        purchase = await db.get_purchase(event.purchase_id)
        if purchase is None:
            _log.error("Purchase not found: %s", event.purchase_id)
            return {"status": "error", "reason": "purchase_not_found"}

        policy = await db.get_policy(event.platform_id)
        if policy is None:
            _log.error("Policy not found for platform: %s", event.platform_id)
            return {"status": "error", "reason": "policy_not_found"}

        user_name = "Valued Customer"
        user = await db.get_user(event.user_id)
        if user is not None:
            user_name = user.name

        # Lazy import: claimit-search may not be installed in all environments
        from search import get_search_adapter

        search_client = get_search_adapter()

        now = datetime.now(UTC)
        claim_id = uuid.uuid5(uuid.NAMESPACE_URL, event.event_id)
        placeholder = "Draft pending generation."

        # Temporary claim object satisfying the model validator (draft_content == draft_versions[-1].content)
        temp_claim = Claim(
            _id=claim_id,
            purchase_id=purchase.id,
            user_id=UUID(event.user_id),
            platform=Platform(event.platform_id),
            claim_amount=event.price_drop_amount,
            currency="USD",
            claim_type=claim_plan.claim_type,
            draft_content=placeholder,
            draft_versions=[
                DraftVersion(
                    version=1,
                    content=placeholder,
                    generated_by=DraftGeneratedBy.AGENT,
                    at=now,
                )
            ],
            redraft_count=0,
            policy_clause_cited="",
            evidence_screenshot_url=None,
            send_override=None,
            submitted_at=None,
            submitted_via=None,
            outcome=ClaimOutcome.DRAFT_PENDING,
            outcome_note=None,
            denial_reason_extracted=None,
            resolved_at=None,
            trace_id=event.event_id,
        )

        if claim_plan.draft_generator == "type_a_email":
            draft = await generate_email_draft(
                temp_claim,
                purchase,
                policy,
                search_client,
                user_name=user_name,
                current_price=event.current_price,
            )
        elif claim_plan.draft_generator == "type_b_chat":
            draft = await generate_chat_script(
                temp_claim, purchase, policy, search_client, user_name=user_name
            )
        else:
            _log.info("Skipping unsupported generator %s", claim_plan.draft_generator)
            return {"status": "skipped", "reason": claim_plan.draft_generator}

        # Persist claim with real draft content
        generated_version = DraftVersion(
            version=1,
            content=draft.draft_content,
            generated_by=DraftGeneratedBy.AGENT,
            at=now,
        )
        final_claim = temp_claim.model_copy(
            update={
                "draft_content": draft.draft_content,
                "draft_versions": [generated_version],
                "policy_clause_cited": draft.policy_clause_cited,
            }
        )
        await db.upsert_claim(final_claim)

        _log.info(
            "Generated %s draft for claim %s (purchase %s)",
            claim_plan.draft_generator,
            claim_id,
            event.purchase_id,
        )
        return {"status": "ok", "claim_id": str(claim_id)}

    except Exception:
        _log.exception("Failed to process price.dropped event")
        return {"status": "error"}
