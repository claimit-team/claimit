"""Mode B claim-scoped tools (ticket 3.23).

Four factory functions, each of which returns a closure-scoped async tool
callable bound to a single `(user_id, claim_id)` pair. The LLM never sees
either ID as a tool argument, so it cannot be tricked by an adversarial
user message ("look up claim XYZ for user ABC") into reaching across
claims or users.

Why factories rather than module-level functions:
- The closure captures user_id + claim_id from the conversation context.
  Mode A's `_search_my_purchases` (mode_a.py:138-149) uses the same
  pattern at the user_id granularity; Mode B narrows further to the
  active claim.
- Factories are unit-testable on their own — pass a fake
  MongoDBClient/publish_event, invoke the returned coroutine, assert
  on shape. Tests must not require live Mongo or Pub/Sub.

Ownership is double-checked at tool entry time. The api-gateway routes
that open a claim-focused conversation already verify the user owns
the claim, but a stale or hijacked session must not be able to flip a
stranger's send_override or queue a redraft on someone else's claim.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

from claimit_mongodb_models import Claim, MongoDBClient, SendMode
from claimit_pubsub import (
    TOPIC_CLAIM_REDRAFT_REQUESTED,
    ClaimRedraftRequestedEvent,
    publish_event,
)

logger = logging.getLogger(__name__)

# Type aliases — every tool is async-returning-dict for ADK FunctionTool.
_ToolResult = dict[str, Any]
_DBFactory = Callable[[], MongoDBClient]
_PublishFn = Callable[[str, ClaimRedraftRequestedEvent], Awaitable[str]]


def _matches_user(claim_user_id: Any, expected_user_id: str) -> bool:
    """Compare the stored claim.user_id (UUID or None on tolerant reads) to
    the closure-bound expected_user_id, accepting either side as string.

    `ClaimReadTolerant` widens required scalars to `T | None`, so a
    legacy/corrupted claim doc may have a null user_id — that path returns
    False (refuses access) rather than raising.
    """
    if claim_user_id is None:
        return False
    return str(claim_user_id) == str(expected_user_id)


def make_get_claim_context(
    *,
    user_id: str,
    claim_id: str,
    db_factory: _DBFactory = MongoDBClient,
) -> Callable[[], Awaitable[_ToolResult]]:
    """Build the `get_claim_context` tool bound to (user_id, claim_id).

    The returned coroutine takes no arguments — claim_id and user_id are
    closed over. This is the only safe shape for an LLM-callable tool that
    must not let the model reach across claims.
    """

    async def get_claim_context() -> _ToolResult:
        """Look up the active claim along with its linked purchase and policy.

        Returns a single bundle the model can summarize when the user asks
        questions like "what is this claim about" or "what policy does
        it cite". Scoped to the active claim — other claims are not
        reachable from this tool.
        """
        db = db_factory()
        claim = await db.get_claim(claim_id)
        if claim is None:
            return {"error": "claim_not_found"}
        if not _matches_user(claim.user_id, user_id):
            logger.warning(
                "get_claim_context refused: user mismatch claim_id=%s expected=%s actual=%s",
                claim_id,
                user_id,
                claim.user_id,
            )
            return {"error": "not_authorized"}

        purchase = None
        if claim.purchase_id is not None:
            purchase = await db.get_purchase(claim.purchase_id)

        policy = None
        if claim.platform is not None:
            policy = await db.get_policy(str(claim.platform))

        return {
            "claim": claim.model_dump(mode="json", by_alias=True),
            "purchase": purchase.model_dump(mode="json", by_alias=True) if purchase else None,
            "policy": policy.model_dump(mode="json", by_alias=True) if policy else None,
        }

    return get_claim_context


def make_update_send_override(
    *,
    user_id: str,
    claim_id: str,
    db_factory: _DBFactory = MongoDBClient,
) -> Callable[[str | None], Awaitable[_ToolResult]]:
    """Build the `update_send_override` tool bound to (user_id, claim_id)."""

    async def update_send_override(mode: str | None) -> _ToolResult:
        """Set this claim's send_override.

        Args:
            mode: "approval" — user must approve each send for this claim;
                  "auto" — auto-send after the standard delay;
                  null — clear override, fall back to the user's account default.
        """
        normalized: SendMode | None
        if mode is None:
            normalized = None
        elif mode == SendMode.APPROVAL.value:
            normalized = SendMode.APPROVAL
        elif mode == SendMode.AUTO.value:
            normalized = SendMode.AUTO
        else:
            return {
                "error": "invalid_mode",
                "allowed": [SendMode.APPROVAL.value, SendMode.AUTO.value, None],
            }

        db = db_factory()
        claim = await db.get_claim(claim_id)
        if claim is None:
            return {"error": "claim_not_found"}
        if not _matches_user(claim.user_id, user_id):
            logger.warning(
                "update_send_override refused: user mismatch claim_id=%s expected=%s actual=%s",
                claim_id,
                user_id,
                claim.user_id,
            )
            return {"error": "not_authorized"}

        ok = await db.partial_update(
            "claims",
            claim_id,
            {"send_override": normalized},
            model=Claim,
        )
        return {"ok": ok, "send_override": mode}

    return update_send_override


def make_request_redraft(
    *,
    user_id: str,
    claim_id: str,
    db_factory: _DBFactory = MongoDBClient,
    publish: _PublishFn = publish_event,
) -> Callable[[str], Awaitable[_ToolResult]]:
    """Build the `request_redraft` tool bound to (user_id, claim_id).

    Note on the in-flight handler: the `/pubsub/claim.redraft_requested`
    consumer on claim-agent ships in ticket 3.21. Until then, the
    Terraform-configured push subscription will fail delivery 5x and
    dead-letter. The publish itself succeeds here — the AC is that
    Mode B can *trigger* the redraft, and the trigger is durable.
    """

    async def request_redraft(feedback: str) -> _ToolResult:
        """Queue a redraft of this claim, biased by the user's feedback.

        Args:
            feedback: Natural-language steer for the new draft, e.g.
                "make it friendlier", "shorter", "more formal".
                Required; trimmed and capped to 500 characters.
        """
        cleaned = (feedback or "").strip()
        if not cleaned:
            return {"error": "empty_feedback"}
        # The Pydantic model also caps at 500, but truncating here gives
        # the LLM a clean success path instead of a validation error it
        # would have to interpret.
        if len(cleaned) > 500:
            cleaned = cleaned[:500]

        db = db_factory()
        claim = await db.get_claim(claim_id)
        if claim is None:
            return {"error": "claim_not_found"}
        if not _matches_user(claim.user_id, user_id):
            logger.warning(
                "request_redraft refused: user mismatch claim_id=%s expected=%s actual=%s",
                claim_id,
                user_id,
                claim.user_id,
            )
            return {"error": "not_authorized"}

        event = ClaimRedraftRequestedEvent(
            user_id=user_id,
            claim_id=claim_id,
            feedback=cleaned,
            requested_by="assistant",
        )
        try:
            message_id = await publish(TOPIC_CLAIM_REDRAFT_REQUESTED, event)
        except Exception as exc:
            logger.exception("request_redraft publish failed claim_id=%s", claim_id)
            return {"error": "publish_failed", "detail": str(exc)}

        return {"ok": True, "message_id": message_id, "event_id": event.event_id}

    return request_redraft


def make_get_reasoning_trace(
    *,
    user_id: str,
    claim_id: str,
    db_factory: _DBFactory = MongoDBClient,
) -> Callable[[], Awaitable[_ToolResult]]:
    """Build the `get_reasoning_trace` tool bound to (user_id, claim_id).

    Plan A (lightweight): the returned payload is built from fields already
    on the claim doc — `policy_clause_cited`, `self_eval_score`,
    `self_eval_attempts`, `trace_id`, `claim_type` — plus a Phoenix UI deep
    link when `PHOENIX_BASE_URL` is set. We do NOT call Phoenix's HTTP API
    from inside the agent; adding the dep and runtime config is a bigger
    architectural commitment than 3.23 should take on. A follow-up ticket
    can upgrade this to span-level summarisation if the demo team wants it.
    """

    async def get_reasoning_trace() -> _ToolResult:
        """Return a structured 'why this draft looks like this' summary.

        Includes the cited policy clause, the claim type the agent chose,
        the self-evaluation scores from the drafting pass, and (when the
        environment is configured) a deep link to the Gemini trace in the
        Phoenix UI for the curious user.
        """
        db = db_factory()
        claim = await db.get_claim(claim_id)
        if claim is None:
            return {"error": "claim_not_found"}
        if not _matches_user(claim.user_id, user_id):
            logger.warning(
                "get_reasoning_trace refused: user mismatch claim_id=%s expected=%s actual=%s",
                claim_id,
                user_id,
                claim.user_id,
            )
            return {"error": "not_authorized"}

        trace_id = claim.trace_id
        phoenix_base = os.environ.get("PHOENIX_BASE_URL", "").rstrip("/")
        phoenix_link = f"{phoenix_base}/traces/{trace_id}" if trace_id and phoenix_base else None

        self_eval: Any = None
        if claim.self_eval_score is not None:
            # ClaimReadTolerant still nests self_eval_score as a strict
            # sub-model when present; fall back to the raw value if a
            # future schema variant changes that.
            self_eval = (
                claim.self_eval_score.model_dump()
                if hasattr(claim.self_eval_score, "model_dump")
                else claim.self_eval_score
            )

        return {
            "claim_type": str(claim.claim_type) if claim.claim_type is not None else None,
            "policy_clause_cited": claim.policy_clause_cited,
            "self_eval_score": self_eval,
            "self_eval_attempts": claim.self_eval_attempts,
            "trace_id": trace_id,
            "phoenix_link": phoenix_link,
        }

    return get_reasoning_trace
