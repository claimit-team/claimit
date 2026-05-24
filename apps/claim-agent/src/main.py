"""ClaimIt claim agent — FastAPI entrypoint."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from claimit_mongodb_models import (
    Claim,
    ClaimOutcome,
    ClaimType,
    DraftGeneratedBy,
    DraftVersion,
    MongoDBClient,
    NotificationEntityType,
    NotificationEventType,
    Platform,
    PurchaseReadTolerant,
    SendMode,
    write_notification_event,
)
from claimit_observability import init_phoenix
from claimit_pubsub.events import ClaimRedraftRequestedEvent
from fastapi import Depends, FastAPI, Request
from pydantic import BaseModel, ConfigDict, Field

from .auth import verify_pubsub_oidc
from .draft._shared import warm_up_draft_model
from .draft.models import ClaimDraft
from .draft.type_a_email import generate_email_draft
from .draft.type_b_chat import generate_chat_script
from .draft.type_c_in_store import generate_in_store_guide
from .draft.type_d_self_service import generate_self_service_walkthrough
from .orchestrate_eval import evaluate_and_maybe_regenerate
from .plan import PriceDroppedEvent, plan_claim
from .redraft_idempotency import mark_redraft_event_done, try_claim_redraft_event
from .send_mode import determine_send_mode, handle_approval_mode, handle_auto_mode
from .submit_claim import publish_claim_approved, submit_claim
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


def _parse_delay_seconds() -> int:
    raw = os.getenv("AUTO_SEND_DELAY_SECONDS", "300")
    try:
        val = int(raw)
        if val <= 0:
            raise ValueError("must be positive")
        return val
    except ValueError:
        _log.warning("Invalid AUTO_SEND_DELAY_SECONDS=%r, defaulting to 300", raw)
        return 300


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-claim-agent")
    _app.state.warmup_task = asyncio.create_task(warm_up_draft_model())
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


async def _decode_pubsub_push_data(request: Request) -> dict:
    """Decode a Pub/Sub push envelope into a JSON event dict."""
    body = _PubSubPushBody.model_validate(await request.json())
    raw_data = base64.b64decode(body.message.data)
    return json.loads(raw_data.decode("utf-8"))


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

        async def _dispatch_generator(c: Claim, user_instruction: str | None = None) -> ClaimDraft:
            if claim_plan.draft_generator == "type_a_email":
                return await generate_email_draft(
                    c,
                    purchase,
                    policy,
                    search_client,
                    user_name=user_name,
                    current_price=event.current_price,
                    user_instruction=user_instruction,
                )
            if claim_plan.draft_generator == "type_b_chat":
                return await generate_chat_script(
                    c,
                    purchase,
                    policy,
                    search_client,
                    user_name=user_name,
                    current_price=event.current_price,
                    user_instruction=user_instruction,
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
                    user_instruction=user_instruction,
                )
            if claim_plan.draft_generator == "type_d_self_service":
                return await generate_self_service_walkthrough(
                    c,
                    purchase,
                    policy,
                    search_client,
                    user_name=user_name,
                    current_price=event.current_price,
                    user_instruction=user_instruction,
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
            suggestions_text = feedback or None
            return await _dispatch_generator(c, user_instruction=suggestions_text)

        try:
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
        except Exception:
            _log.exception(
                "self_eval failed for claim %s — proceeding with validated draft",
                claim_id,
            )
            eval_result = None
            attempts = 0

        # Persist claim with real draft content
        generated_version = DraftVersion(
            version=1,
            content=draft.draft_content,
            generated_by=DraftGeneratedBy.AGENT,
            at=now,
        )
        # `subject` and `recipient_email` come from the ClaimDraft (draft/
        # models.py:12-13) and only matter for EMAIL-type claims; for chat/
        # in-store/self-service drafts these stay None. We persist them now
        # so the send phase (submit_claim → gmail_send, ticket 4.18) has a
        # stable target without re-running the LLM or re-resolving policy.
        is_email_claim = claim_plan.claim_type == ClaimType.EMAIL
        final_claim = temp_claim.model_copy(
            update={
                "draft_content": draft.draft_content,
                "draft_versions": [generated_version],
                "policy_clause_cited": draft.policy_clause_cited,
                "subject": draft.subject if is_email_claim else None,
                "recipient_email": draft.to_address if is_email_claim else None,
                "self_eval_score": eval_result.scores if eval_result is not None else None,
                "self_eval_attempts": attempts,
            }
        )
        await db.upsert_claim(final_claim)
        mode = SendMode.APPROVAL if user is None else determine_send_mode(user, final_claim)
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
                "send_mode": mode.value,
                "platform": event.platform_id,
            },
        )
        if notif_id is None:
            _log.warning("Failed to write claim_drafted notification for claim %s", claim_id)

        if mode == SendMode.AUTO:
            final_claim, auto_send_at = await handle_auto_mode(
                claim=final_claim,
                db=db,
                event_platform_id=event.platform_id,
                refund_amount=event.price_drop_amount,
                delay_seconds=_parse_delay_seconds(),
            )
            await write_notification_event(
                db=db,
                user_id=str(event.user_id),
                event_type=NotificationEventType.CLAIM_QUEUED_AUTO,
                entity_type=NotificationEntityType.CLAIM,
                entity_id=str(claim_id),
                data={
                    "claim_id": str(claim_id),
                    "auto_send_at": auto_send_at.isoformat(),
                    "refund_amount": event.price_drop_amount,
                },
            )
        else:
            final_claim = await handle_approval_mode(
                claim=final_claim,
                db=db,
                event_platform_id=event.platform_id,
                refund_amount=event.price_drop_amount,
            )

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


@app.post(
    "/pubsub/claim.approved",
    status_code=200,
    dependencies=[Depends(verify_pubsub_oidc)],
)
async def handle_claim_approved(request: Request) -> dict[str, str]:
    """Handle Pub/Sub push for claim.approved — submit pending claims.

    Gateway publishes a rich trigger payload when the user approves a draft;
    auto-send publishes a post-submit notification after inline submit.
    Idempotency skips duplicates so auto-send notifications do not
    double-submit.

    Always returns 200 to ack the message.
    """
    try:
        payload = await _decode_pubsub_push_data(request)
        claim_id = payload.get("claim_id")
        user_id = payload.get("user_id")
        if not claim_id or not user_id:
            _log.error("claim_agent.approved.missing_fields payload=%r", payload)
            return {"status": "error", "reason": "missing_fields"}

        db = MongoDBClient()
        claim = await db.get_claim(str(claim_id))
        if claim is None:
            _log.error("claim_agent.approved.claim_not_found claim_id=%s", claim_id)
            return {"status": "error", "reason": "claim_not_found"}

        if str(claim.user_id) != str(user_id):
            _log.error(
                "claim_agent.approved.user_mismatch claim_id=%s event_user=%s claim_user=%s",
                claim_id,
                user_id,
                claim.user_id,
            )
            return {"status": "error", "reason": "permission_denied"}

        if claim.submitted_via is not None:
            _log.info(
                "claim_agent.approved.skip_already_submitted claim_id=%s submitted_via=%s",
                claim_id,
                claim.submitted_via,
            )
            return {"status": "skipped", "reason": "already_submitted"}

        if claim.outcome != ClaimOutcome.PENDING.value:
            _log.info(
                "claim_agent.approved.skip_not_pending claim_id=%s outcome=%r",
                claim_id,
                claim.outcome,
            )
            return {"status": "skipped", "reason": "not_pending"}

        user = await db.get_user(claim.user_id)
        if user is None:
            _log.error(
                "claim_agent.approved.user_not_found claim_id=%s user_id=%s", claim_id, user_id
            )
            return {"status": "error", "reason": "user_not_found"}

        await submit_claim(claim, user, db)
        _log.info("claim_agent.approved.submitted claim_id=%s", claim_id)
        return {"status": "ok"}

    except Exception:
        _log.exception("Failed to process claim.approved event")
        return {"status": "error", "reason": "internal_error"}


# Auto-send cron handler — wired to a Cloud Scheduler job in
# infra/terraform/scheduler.tf (resource: claim_auto_send, ticket 5.15
# / WI-10). Scheduler fires this endpoint every minute, the worker
# picks up queued claims whose `auto_send_at` has elapsed, and
# `submit_claim` flips them to `pending` + emits the
# `claim_submitted` NotificationEvent that drives the dashboard
# banner's Sent ✓ flip via SSE.
#
# Concurrency: Cloud Scheduler's `attempt_deadline = 60s` matches the
# cron cadence; the re-read guard below (L469-L471) is the second
# layer that prevents duplicate submits if a run goes long.
@app.post("/internal/auto-send")
async def handle_auto_send(request: Request) -> dict:
    now = datetime.now(UTC)
    db = MongoDBClient()

    # Single-worker model: Cloud Scheduler max_concurrent_dispatches=1
    # + re-read guard below prevents double-processing.
    batch_size = int(os.getenv("AUTO_SEND_BATCH_SIZE", "50"))
    overdue = await db.find_claims(
        {
            "outcome": ClaimOutcome.QUEUED_FOR_SEND.value,
            "auto_send_at": {"$lte": now},
        },
        limit=batch_size,
    )

    results: dict[str, int] = {"processed": 0, "errors": 0}
    for claim in overdue:
        try:
            current = await db.get_claim(claim.id)
            if current is None or current.outcome != ClaimOutcome.QUEUED_FOR_SEND:
                continue

            user = await db.get_user(current.user_id)
            if user is None:
                _log.error("User not found for claim %s", claim.id)
                results["errors"] += 1
                continue

            previous_auto_send_at = current.auto_send_at

            submit_result = await submit_claim(current, user, db)

            try:
                await publish_claim_approved(
                    claim=current,
                    submitted_via=submit_result.submitted_via,
                    approved_by="auto",
                )
            except Exception:
                _log.exception(
                    "Failed to publish claim.approved for claim %s; rolling back to queued_for_send",
                    current.id,
                )
                try:
                    rolled_back = await db.partial_update(
                        "claims",
                        current.id,
                        {
                            "outcome": ClaimOutcome.QUEUED_FOR_SEND.value,
                            "submitted_at": None,
                            "submitted_via": None,
                            "auto_send_at": previous_auto_send_at,
                        },
                    )
                    if not rolled_back:
                        _log.error(
                            "Rollback matched no claim after publish failure for claim %s; "
                            "manual fix required",
                            current.id,
                        )
                except Exception:
                    _log.exception(
                        "Rollback failed after publish failure for claim %s; manual fix required",
                        current.id,
                    )
                results["errors"] += 1
                continue

            await write_notification_event(
                db=db,
                user_id=str(current.user_id),
                event_type=NotificationEventType.CLAIM_SUBMITTED,
                entity_type=NotificationEntityType.CLAIM,
                entity_id=str(current.id),
                data={
                    "claim_id": str(current.id),
                    "submitted_via": submit_result.submitted_via.value,
                    "refund_amount": current.claim_amount,
                },
            )
            results["processed"] += 1

        except Exception as exc:
            _log.exception("Auto-send failed for claim %s: %s", claim.id, exc)
            results["errors"] += 1

    return results


@app.post("/pubsub/claim.redraft_requested", status_code=200)
async def handle_claim_redraft_requested(request: Request) -> dict[str, str]:
    """Handle Pub/Sub push for claim.redraft_requested events.

    Always returns 200 to ack the message — errors are logged, never retried
    via a 5xx, to prevent Pub/Sub infinite-retry loops.
    """
    try:
        body_json = await request.json()
        push_body = _PubSubPushBody.model_validate(body_json)
        raw_data = base64.b64decode(push_body.message.data)
        event = ClaimRedraftRequestedEvent.model_validate_json(raw_data)

        db = MongoDBClient()

        claim = await db.get_claim(event.claim_id)
        if claim is None:
            _log.error("claim_agent.redraft.claim_not_found claim_id=%s", event.claim_id)
            return {"status": "error", "reason": "claim_not_found"}

        if str(claim.user_id) != str(event.user_id):
            _log.error(
                "claim_agent.redraft.user_mismatch claim_id=%s event_user=%s claim_user=%s",
                event.claim_id,
                event.user_id,
                claim.user_id,
            )
            return {"status": "error", "reason": "permission_denied"}

        purchase = await db.get_purchase(claim.purchase_id)
        if purchase is None:
            _log.error("claim_agent.redraft.purchase_not_found claim_id=%s", event.claim_id)
            return {"status": "error", "reason": "purchase_not_found"}

        policy = await db.get_policy(str(claim.platform))
        if policy is None:
            _log.error(
                "claim_agent.redraft.policy_not_found claim_id=%s platform=%s",
                event.claim_id,
                claim.platform,
            )
            return {"status": "error", "reason": "policy_not_found"}

        user = await db.get_user(claim.user_id)
        user_name = (user.name or "").strip() or "Valued Customer" if user else "Valued Customer"

        claim_type_routing = {
            ClaimType.EMAIL: generate_email_draft,
            ClaimType.CHAT_SCRIPT: generate_chat_script,
            ClaimType.IN_STORE: generate_in_store_guide,
            ClaimType.SELF_SERVICE: generate_self_service_walkthrough,
        }
        try:
            claim_type_enum = ClaimType(claim.claim_type)
        except (ValueError, TypeError):
            _log.error(
                "claim_agent.redraft.unknown_claim_type claim_id=%s type=%r",
                event.claim_id,
                claim.claim_type,
            )
            return {"status": "error", "reason": "unknown_claim_type"}

        generator = claim_type_routing.get(claim_type_enum)
        if generator is None:
            return {"status": "error", "reason": "unsupported_claim_type"}

        if not await try_claim_redraft_event(db, event_id=event.event_id, claim_id=event.claim_id):
            _log.info(
                "claim_agent.redraft.already_processed claim_id=%s event_id=%s",
                event.claim_id,
                event.event_id,
            )
            return {"status": "ok", "reason": "already_processed"}

        from search import get_search_adapter

        search_client = get_search_adapter()

        current_price = (purchase.price_paid or 0.0) - (claim.claim_amount or 0.0)

        gen_kwargs: dict = dict(
            user_name=user_name,
            current_price=current_price,
            # `user_instruction` is the generator's kwarg (downstream API,
            # unchanged); the event-side field was renamed to `feedback`
            # in the PR-#174 schema refactor — more accurate for what the
            # user sends about the current draft. Don't rename the
            # generator side unless every draft-type signature is changed
            # in lockstep; the event→generator mapping happens here.
            user_instruction=event.feedback,
        )
        if claim_type_enum == ClaimType.IN_STORE:
            gen_kwargs["user_location"] = getattr(user, "default_location", None)

        draft = await generator(claim, purchase, policy, search_client, **gen_kwargs)

        validation = validate(draft, claim, purchase)
        if not validation.valid:
            _log.warning(
                "claim_agent.redraft.validation_failed claim_id=%s issues=%s",
                event.claim_id,
                validation.issues,
            )
            if (claim.redraft_count or 0) >= 1:
                await write_notification_event(
                    db=db,
                    user_id=event.user_id,
                    event_type=NotificationEventType.CLAIM_DRAFTED,
                    entity_type=NotificationEntityType.CLAIM,
                    entity_id=event.claim_id,
                    data={
                        "claim_id": event.claim_id,
                        "claim_type": claim.claim_type,
                        "refund_amount": claim.claim_amount,
                        "platform": claim.platform,
                        "validation_failed": True,
                        "validation_issues": validation.issues,
                        "escalated": True,
                    },
                )
            return {"status": "error", "reason": "validation_failed"}

        _log.info("claim_agent.redraft.skip_self_eval claim_id=%s", event.claim_id)
        final_draft = draft

        now = datetime.now(UTC)
        next_version = await db.atomic_append_draft_version(
            "claims",
            event.claim_id,
            content=final_draft.draft_content,
            generated_by=DraftGeneratedBy.ASSISTANT_REDRAFT,
            at=now,
            extra_updates={
                "self_eval_score": None,
                "self_eval_attempts": getattr(claim, "self_eval_attempts", 0),
            },
        )
        new_version = DraftVersion(
            version=next_version,
            content=final_draft.draft_content,
            generated_by=DraftGeneratedBy.ASSISTANT_REDRAFT,
            at=now,
        )
        await mark_redraft_event_done(db, event_id=event.event_id, version=next_version)

        mode = SendMode.APPROVAL if user is None else determine_send_mode(user, claim)
        notif_id = await write_notification_event(
            db=db,
            user_id=event.user_id,
            event_type=NotificationEventType.CLAIM_DRAFTED,
            entity_type=NotificationEntityType.CLAIM,
            entity_id=event.claim_id,
            data={
                "claim_id": event.claim_id,
                "claim_type": str(claim.claim_type),
                "refund_amount": claim.claim_amount,
                "send_mode": str(mode),
                "platform": str(claim.platform),
            },
        )
        if notif_id is None:
            _log.warning(
                "Failed to write claim_drafted notification for redraft claim %s", event.claim_id
            )

        try:
            platform_enum = Platform(claim.platform)
        except (ValueError, TypeError):
            _log.error(
                "claim_agent.redraft.invalid_platform claim_id=%s platform=%r",
                event.claim_id,
                claim.platform,
            )
            return {"status": "error", "reason": "invalid_platform"}

        send_override_enum = SendMode(claim.send_override) if claim.send_override else None
        dispatch_claim = Claim(
            _id=UUID(str(claim.id)),
            purchase_id=claim.purchase_id,
            user_id=claim.user_id,
            platform=platform_enum,
            claim_amount=claim.claim_amount or 0.01,
            currency=claim.currency or "USD",
            claim_type=claim_type_enum,
            draft_content=final_draft.draft_content,
            draft_versions=[new_version],
            redraft_count=(claim.redraft_count or 0) + 1,
            policy_clause_cited=claim.policy_clause_cited or "",
            evidence_screenshot_url=claim.evidence_screenshot_url,
            send_override=send_override_enum,
            submitted_at=None,
            submitted_via=None,
            outcome=ClaimOutcome.DRAFT_PENDING,
            outcome_note=None,
            denial_reason_extracted=None,
            resolved_at=None,
            trace_id=claim.trace_id,
        )

        if mode == SendMode.AUTO:
            dispatch_claim, auto_send_at = await handle_auto_mode(
                claim=dispatch_claim,
                db=db,
                event_platform_id=str(claim.platform),
                refund_amount=claim.claim_amount or 0.0,
                delay_seconds=_parse_delay_seconds(),
            )
            await write_notification_event(
                db=db,
                user_id=str(event.user_id),
                event_type=NotificationEventType.CLAIM_QUEUED_AUTO,
                entity_type=NotificationEntityType.CLAIM,
                entity_id=event.claim_id,
                data={
                    "claim_id": event.claim_id,
                    "auto_send_at": auto_send_at.isoformat(),
                    "refund_amount": claim.claim_amount or 0.0,
                },
            )
        else:
            dispatch_claim = await handle_approval_mode(
                claim=dispatch_claim,
                db=db,
                event_platform_id=str(claim.platform),
                refund_amount=claim.claim_amount or 0.0,
            )

        _log.info(
            "claim_agent.redraft.complete claim_id=%s version=%d",
            event.claim_id,
            next_version,
        )
        return {"status": "ok"}

    except Exception as exc:
        _log.exception("Failed to process claim.redraft_requested event")
        return {"status": "error", "reason": str(exc)}
