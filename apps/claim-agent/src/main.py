"""ClaimIt claim agent — FastAPI entrypoint."""

from __future__ import annotations

import base64
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from claimit_mongodb_models import (
    Claim,
    ClaimOutcome,
    DraftGeneratedBy,
    DraftVersion,
    MongoDBClient,
    NotificationEntityType,
    NotificationEventType,
    Platform,
    PurchaseReadTolerant,
    write_notification_event,
)
from claimit_observability import init_phoenix
from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field

from .draft.models import ClaimDraft
from .draft.type_a_email import generate_email_draft
from .draft.type_b_chat import generate_chat_script
from .draft.type_c_in_store import generate_in_store_guide
from .draft.type_d_self_service import generate_self_service_walkthrough
from .orchestrate_eval import evaluate_and_maybe_regenerate
from .plan import PriceDroppedEvent, plan_claim
from .validator import validate

_log = logging.getLogger(__name__)


def _purchase_degraded_reason(purchase: PurchaseReadTolerant) -> str | None:
    """Return a human-readable reason if `purchase` is missing fields the
    drafting pipeline needs, or `None` if it's processable.

    Mirrors `monitor-agent.cron._is_degraded`: same field set the
    downstream draft generators dereference on every run
    (`purchase.platform`, `price_paid`, `purchase_date`, `window_expires`,
    `order_id`, `product_name`). A null/unknown value here means we'd
    otherwise hand garbage to the LLM and persist a half-baked claim.
    The §4 contract is to log a warning + skip rather than abort — the
    upstream Pub/Sub event ack is still 200 so the broker doesn't
    redeliver.
    """
    if purchase.id is None:
        return "null _id"
    if purchase.platform is None:
        return "null platform"
    try:
        Platform(purchase.platform)
    except ValueError:
        return f"unknown platform {purchase.platform!r}"
    if purchase.price_paid is None:
        return "null price_paid"
    if purchase.purchase_date is None:
        return "null purchase_date"
    if purchase.window_expires is None:
        return "null window_expires"
    if not purchase.order_id:
        return "null/empty order_id"
    if not purchase.product_name:
        return "null/empty product_name"
    return None


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
    # TODO(post-hackathon): add Pub/Sub push authentication (OIDC token verification)
    event = None
    claim_plan = None
    try:
        body = _PubSubPushBody.model_validate(await request.json())
        raw_data = base64.b64decode(body.message.data).decode("utf-8")
        event = PriceDroppedEvent.model_validate_json(raw_data)

        db = MongoDBClient()
        claim_plan = await plan_claim(event, db)

        # `db.get_purchase` returns the read-tolerant variant so a legacy
        # doc with a now-invalid enum or a null required field doesn't 500
        # this handler. The downstream draft generators consume the same
        # field set whether the source is strict or tolerant — they
        # already use `str(purchase.platform)` and similar safe accessors —
        # so we pass the tolerant instance through directly after a
        # degraded-fields gate. This is the §4 "don't draft garbage"
        # contract from the read-tolerance follow-up.
        purchase = await db.get_purchase(event.purchase_id)
        if purchase is None:
            _log.error("Purchase not found: %s", event.purchase_id)
            return {"status": "error", "reason": "purchase_not_found"}
        degraded_reason = _purchase_degraded_reason(purchase)
        if degraded_reason is not None:
            _log.warning(
                "claim_agent.skip_degraded_purchase purchase_id=%s reason=%s",
                event.purchase_id,
                degraded_reason,
            )
            return {"status": "skipped", "reason": "degraded_purchase"}

        policy = await db.get_policy(event.platform_id)
        if policy is None:
            _log.error("Policy not found for platform: %s", event.platform_id)
            return {"status": "error", "reason": "policy_not_found"}

        user_name = "Valued Customer"
        user = await db.get_user(event.user_id)
        if user is not None:
            user_name = (user.name or "").strip() or "Valued Customer"

        # Lazy import: claimit-search may not be installed in all environments
        from search import get_search_adapter

        search_client = get_search_adapter()

        now = datetime.now(UTC)
        claim_id = (
            UUID(event.claim_id)
            if event.claim_id is not None
            else uuid5(NAMESPACE_URL, f"claim:{event.event_id}")
        )
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

        async def _dispatch_generator(c: Claim) -> ClaimDraft:
            if claim_plan.draft_generator == "type_a_email":
                return await generate_email_draft(
                    c,
                    purchase,
                    policy,
                    search_client,
                    user_name=user_name,
                    current_price=event.current_price,
                )
            if claim_plan.draft_generator == "type_b_chat":
                return await generate_chat_script(
                    c,
                    purchase,
                    policy,
                    search_client,
                    user_name=user_name,
                    current_price=event.current_price,
                )
            if claim_plan.draft_generator == "type_c_in_store":
                return await generate_in_store_guide(
                    c,
                    purchase,
                    policy,
                    search_client,
                    user_name=user_name,
                    current_price=event.current_price,
                    user_location=user.default_location if user else None,
                )
            if claim_plan.draft_generator == "type_d_self_service":
                return await generate_self_service_walkthrough(
                    c,
                    purchase,
                    policy,
                    search_client,
                    user_name=user_name,
                    current_price=event.current_price,
                )
            raise ValueError(f"Unknown generator: {claim_plan.draft_generator}")

        if claim_plan.draft_generator not in {
            "type_a_email",
            "type_b_chat",
            "type_c_in_store",
            "type_d_self_service",
        }:
            _log.info("Skipping unsupported generator %s", claim_plan.draft_generator)
            return {"status": "skipped", "reason": claim_plan.draft_generator}

        draft = await _dispatch_generator(temp_claim)

        # --- Validate draft (task 3.18) ---
        validation = validate(draft, temp_claim, purchase)
        if not validation.valid:
            _log.warning(
                "claim_agent.validation_failed claim_id=%s issues=%s",
                claim_id,
                validation.issues,
            )
            # NOTE: redraft_count on temp_claim is always 0 for new claims.
            # This branch becomes reachable in task 3.21 when redrafting from
            # a persisted claim with redraft_count >= 1.
            if temp_claim.redraft_count >= 1:
                # Second consecutive failure — escalate to user
                await write_notification_event(
                    db=db,
                    user_id=event.user_id,
                    event_type=NotificationEventType.CLAIM_DRAFTED,
                    entity_type=NotificationEntityType.CLAIM,
                    entity_id=str(claim_id),
                    data={
                        "claim_id": str(claim_id),
                        "claim_type": claim_plan.claim_type.value,
                        "refund_amount": event.price_drop_amount,
                        "platform": event.platform_id,
                        "validation_failed": True,
                        "validation_issues": validation.issues,
                        "escalated": True,
                    },
                )
                return {
                    "status": "error",
                    "reason": "validation_failed_escalated",
                    "issues": validation.issues,
                }
            return {
                "status": "error",
                "reason": "validation_failed",
                "issues": validation.issues,
            }

        # --- Self-evaluation pass (task 3.19) ---
        async def _regenerate(current_draft: ClaimDraft, feedback: str, c: Claim) -> ClaimDraft:
            _log.info(
                "self_eval.regenerate claim_id=%s feedback=%r",
                c.id,
                feedback[:200],
            )
            return await _dispatch_generator(c)

        draft, eval_result, attempts = await evaluate_and_maybe_regenerate(
            draft, temp_claim, purchase, policy, regenerate_fn=_regenerate
        )

        if not eval_result.passed:
            _log.warning(
                "claim %s proceeding with failed self_eval dims=%s after %d attempts",
                claim_id,
                eval_result.failed_dimensions,
                attempts,
            )

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
                "self_eval_score": eval_result.scores,
                "self_eval_attempts": attempts,
            }
        )
        await db.upsert_claim(final_claim)
        notif_id = await write_notification_event(
            db=db,
            user_id=event.user_id,
            event_type=NotificationEventType.CLAIM_DRAFTED,
            entity_type=NotificationEntityType.CLAIM,
            entity_id=str(claim_id),
            data={
                "claim_id": str(claim_id),
                "claim_type": claim_plan.claim_type.value,
                "refund_amount": event.price_drop_amount,
                "send_mode": final_claim.send_override.value
                if final_claim.send_override
                else "approval",
                "platform": event.platform_id,
            },
        )
        if notif_id is None:
            _log.warning("Failed to write claim_drafted notification for claim %s", claim_id)
        # TODO(task-3.20): write_notification_event claim_queued_auto here
        # TODO(task-3.20): write_notification_event claim_submitted here
        # TODO(task-3.20): write_notification_event claim_denied here
        # TODO(task-3.20): write_notification_event claim_resolved_success here

        _log.info(
            "Generated %s draft for claim %s (purchase %s)",
            claim_plan.draft_generator,
            claim_id,
            event.purchase_id,
        )
        return {"status": "ok", "claim_id": str(claim_id)}

    except Exception:
        _log.exception(
            "Failed to process price.dropped event",
            extra={
                "event_id": getattr(event, "event_id", "unknown"),
                "purchase_id": getattr(event, "purchase_id", "unknown"),
                "draft_generator": getattr(claim_plan, "draft_generator", "unknown"),
            },
        )
        return {"status": "error"}
