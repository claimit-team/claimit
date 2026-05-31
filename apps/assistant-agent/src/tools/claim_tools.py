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

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

from claimit_mcp.phoenix import QueryResult, SpanRecord, read_claim_reasoning_spans
from claimit_mongodb_models import Claim, MongoDBClient, SendMode
from claimit_pubsub import (
    TOPIC_CLAIM_REDRAFT_REQUESTED,
    ClaimRedraftRequestedEvent,
    publish_event,
)

logger = logging.getLogger(__name__)

# Outer budget for the whole get_reasoning_trace tool (Mongo get_claim + the
# Phoenix MCP read). Raised from 5.0 to 8.0 when the trace read moved off the
# in-process phoenix.client (1.5s) onto a Phoenix MCP round-trip (agent ->
# Cloud Run supergateway -> stdio phoenix-mcp -> Phoenix API + OIDC mint + MCP
# handshake), which is materially slower.
_REASONING_TRACE_TIMEOUT_SECONDS = 8.0
# Inner budget passed to the Phoenix MCP read — kept strictly below the outer
# budget so a slow Phoenix yields a graceful status="timeout" rather than
# tripping the outer wait_for (which returns the terser timeout payload), and
# leaves headroom for the Mongo get_claim call in the same _run().
_PHOENIX_QUERY_TIMEOUT_SECONDS = 6.0
# Mongo MCP calls inside the same VPC should resolve in well under a
# second; 5s is a generous outer bound so a wedged MCP server can never
# hang the tool call indefinitely (BUG-61).
_MONGO_TIMEOUT_SECONDS = 5.0


async def _safe_db_call(
    op_name: str,
    log_ctx: dict[str, Any],
    coro_factory: Callable[[], Awaitable[Any]],
) -> tuple[Any, dict[str, Any] | None]:
    """Run a single Mongo call with timeout + structured-error fallback.

    Returns `(result, None)` on success or `(None, error_dict)` on timeout
    or exception. Caller propagates the error dict directly to the LLM so
    the model can tell the user the system is slow instead of inventing
    an answer (BUG-31 user-visible symptom carried over from search_tools).

    `coro_factory` is a zero-arg callable returning a fresh coroutine —
    needed because asyncio.wait_for can only consume each coroutine once
    and we want one clean retry-free attempt per call.
    """
    try:
        result = await asyncio.wait_for(coro_factory(), timeout=_MONGO_TIMEOUT_SECONDS)
    except TimeoutError:
        logger.warning("%s timed out ctx=%s", op_name, log_ctx)
        return None, {
            "error": f"{op_name}_timeout",
            "message": "Claim system is temporarily slow, please try again.",
        }
    except Exception:
        logger.exception("%s failed ctx=%s", op_name, log_ctx)
        return None, {
            "error": f"{op_name}_failed",
            "message": "Claim system is temporarily unavailable, please try again.",
        }
    return result, None


# Type aliases — every tool is async-returning-dict for ADK FunctionTool.
_ToolResult = dict[str, Any]
_DBFactory = Callable[[], MongoDBClient]
_PublishFn = Callable[[str, ClaimRedraftRequestedEvent], Awaitable[str]]
_PhoenixQueryFn = Callable[[str], Awaitable[QueryResult]]


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
        ctx = {"tool": "get_claim_context", "claim_id": claim_id}
        claim, err = await _safe_db_call("get_claim", ctx, lambda: db.get_claim(claim_id))
        if err is not None:
            return err
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
            purchase, perr = await _safe_db_call(
                "get_purchase", ctx, lambda: db.get_purchase(claim.purchase_id)
            )
            # Purchase fetch is best-effort — the LLM can still summarize the
            # claim itself if the linked purchase doc happens to be slow,
            # so we degrade to None rather than failing the whole bundle.
            if perr is not None:
                purchase = None

        policy = None
        if claim.platform is not None:
            policy, polerr = await _safe_db_call(
                "get_policy", ctx, lambda: db.get_policy(str(claim.platform))
            )
            if polerr is not None:
                policy = None

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
        ctx = {"tool": "update_send_override", "claim_id": claim_id}
        claim, err = await _safe_db_call("get_claim", ctx, lambda: db.get_claim(claim_id))
        if err is not None:
            return err
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

        ok, uerr = await _safe_db_call(
            "partial_update",
            ctx,
            lambda: db.partial_update(
                "claims",
                claim_id,
                {"send_override": normalized},
                model=Claim,
            ),
        )
        if uerr is not None:
            return uerr
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
        ctx = {"tool": "request_redraft", "claim_id": claim_id}
        claim, err = await _safe_db_call("get_claim", ctx, lambda: db.get_claim(claim_id))
        if err is not None:
            return err
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
        except Exception:
            # Keep exception detail in server logs only — surfacing it to
            # the LLM (and from there to the user) risks leaking internal
            # state like project IDs or broker hostnames embedded in
            # google-cloud-pubsub error messages.
            logger.exception("request_redraft publish failed claim_id=%s", claim_id)
            return {"error": "publish_failed"}

        return {"ok": True, "message_id": message_id, "event_id": event.event_id}

    return request_redraft


def _build_trace_summary(
    *,
    claim_type: str | None,
    policy_clause: str | None,
    phoenix_query_status: str,
    self_eval: Any,
    validator_attempts: list[dict[str, Any]],
) -> str:
    """Human-readable fallback the LLM can quote when Phoenix is down."""
    parts: list[str] = []
    if claim_type:
        parts.append(f"Claim type: {claim_type}.")
    if policy_clause:
        trimmed = policy_clause.strip()
        if trimmed:
            parts.append(f"Policy cited: {trimmed[:240]}{'…' if len(trimmed) > 240 else ''}")
    if self_eval:
        parts.append("Self-evaluation scores are stored on the claim record.")
    if phoenix_query_status == "ok":
        if validator_attempts:
            parts.append(f"Validator history covers {len(validator_attempts)} draft version(s).")
        else:
            parts.append("Phoenix trace is available but has no validator spans yet.")
    elif phoenix_query_status == "pending":
        parts.append("Phoenix trace is still exporting — use claim context for now.")
    elif phoenix_query_status == "timeout":
        parts.append("Phoenix query timed out — answer from claim context instead.")
    else:
        parts.append("Phoenix trace is unavailable — answer from claim context instead.")
    return " ".join(parts) if parts else "Use claim context to explain this draft."


def make_get_reasoning_trace(
    *,
    user_id: str,
    claim_id: str,
    db_factory: _DBFactory = MongoDBClient,
    phoenix_query: _PhoenixQueryFn = read_claim_reasoning_spans,
) -> Callable[[], Awaitable[_ToolResult]]:
    """Build the `get_reasoning_trace` tool bound to (user_id, claim_id).

    Reads the claim doc for the always-available fields (claim_type, cited
    policy clause, trace_id, Phoenix UI deep-link) and queries Phoenix for
    the per-attempt validator and self-evaluation spans emitted by
    claim-agent (`validator.validate`, `self_evaluate.evaluate`). The
    LLM gets back a single payload with `phoenix_query_status` so it can
    cite specific draft attempts when the trace is available and degrade
    gracefully to claim-doc-only context when it isn't.
    """

    async def get_reasoning_trace() -> _ToolResult:
        """Return a structured 'why this draft looks like this' summary.

        Includes the cited policy clause, the claim type the agent chose,
        per-attempt validator results (issue_count + issue_types per
        draft.version), per-attempt self-evaluation scores (which
        dimensions failed each retry), and a deep link to the trace in
        the Phoenix UI.

        Phoenix availability is reported as `phoenix_query_status`:
        - "ok"          — spans returned; validator_attempts and
                          self_eval_attempts are populated.
        - "pending"     — claim exists but spans haven't been exported
                          yet (BatchSpanProcessor has a 5s schedule).
        - "timeout"     — query exceeded the Phoenix MCP read budget.
        - "unavailable" — Phoenix env vars unset or the API rejected us.
        """

        async def _run() -> _ToolResult:
            db = db_factory()
            try:
                claim = await db.get_claim(claim_id)
            except Exception:
                logger.exception("get_reasoning_trace claim lookup failed claim_id=%s", claim_id)
                return {"error": "claim_lookup_failed"}

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
            phoenix_link = (
                f"{phoenix_base}/traces/{trace_id}" if trace_id and phoenix_base else None
            )

            self_eval: Any = None
            if claim.self_eval_score is not None:
                self_eval = (
                    claim.self_eval_score.model_dump()
                    if hasattr(claim.self_eval_score, "model_dump")
                    else claim.self_eval_score
                )

            claim_type = str(claim.claim_type) if claim.claim_type is not None else None
            policy_clause = claim.policy_clause_cited

            payload: _ToolResult = {
                "claim_type": claim_type,
                "policy_clause_cited": policy_clause,
                "self_eval_score": self_eval,
                "self_eval_attempts": claim.self_eval_attempts,
                "trace_id": trace_id,
                "phoenix_link": phoenix_link,
                "phoenix_query_status": "unavailable",
                "validator_attempts": [],
                "self_eval_attempts_detail": [],
                "trace_summary": _build_trace_summary(
                    claim_type=claim_type,
                    policy_clause=policy_clause,
                    phoenix_query_status="unavailable",
                    self_eval=self_eval,
                    validator_attempts=[],
                ),
            }

            try:
                query_result = await phoenix_query(
                    claim_id,
                    timeout=_PHOENIX_QUERY_TIMEOUT_SECONDS,
                )
            except Exception:
                logger.exception("get_reasoning_trace phoenix query raised claim_id=%s", claim_id)
                return payload

            payload["phoenix_query_status"] = query_result.status

            if query_result.status == "ok":
                payload["validator_attempts"] = _aggregate_validator_attempts(query_result.spans)
                payload["self_eval_attempts_detail"] = _aggregate_self_eval_attempts(
                    query_result.spans
                )

            payload["trace_summary"] = _build_trace_summary(
                claim_type=claim_type,
                policy_clause=policy_clause,
                phoenix_query_status=query_result.status,
                self_eval=self_eval,
                validator_attempts=payload["validator_attempts"],
            )
            return payload

        try:
            return await asyncio.wait_for(_run(), timeout=_REASONING_TRACE_TIMEOUT_SECONDS)
        except TimeoutError:
            logger.warning("get_reasoning_trace timed out claim_id=%s", claim_id)
            return {
                "phoenix_query_status": "timeout",
                "trace_summary": (
                    "Reasoning trace lookup timed out. Explain the draft using "
                    "get_claim_context policy and claim fields instead."
                ),
            }

    return get_reasoning_trace


def _aggregate_validator_attempts(spans: list[SpanRecord]) -> list[dict[str, Any]]:
    """Pluck `validator.validate` spans, dedupe by draft.version, return
    them sorted ascending so the LLM can narrate "draft 1 had X issues,
    draft 2 was clean" without re-sorting.

    Dedup is last-write-wins: if Phoenix returns multiple spans for the
    same draft.version (re-emission on a transient retry, or a future
    code path that emits twice), we keep the most recent attempt rather
    than surfacing duplicate "attempts" with identical keys."""
    by_draft: dict[int, dict[str, Any]] = {}
    for span in spans:
        if span.name != "validator.validate":
            continue
        attrs = span.attributes
        issue_count = _as_int(attrs.get("validator.issue_count"), default=0)
        draft_version = _as_int(attrs.get("draft.version"), default=0)
        by_draft[draft_version] = {
            "draft_version": draft_version,
            "passed": issue_count == 0,
            "issue_count": issue_count,
            "issue_types": _as_list(attrs.get("validator.issue_types")),
        }
    return [by_draft[k] for k in sorted(by_draft)]


def _aggregate_self_eval_attempts(spans: list[SpanRecord]) -> list[dict[str, Any]]:
    """Pluck `self_evaluate.evaluate` spans into per-retry summaries.

    Each retry's span carries the rubric scores as individual attributes
    (`self_eval.score.clarity`, ...) plus the aggregate `passed` flag and
    `failed_dimensions` list. Deduped by `self_eval.retry_count`
    (last-write-wins) — see the matching note on `_aggregate_validator_*`."""
    by_retry: dict[int, dict[str, Any]] = {}
    for span in spans:
        if span.name != "self_evaluate.evaluate":
            continue
        attrs = span.attributes
        retry_count = _as_int(attrs.get("self_eval.retry_count"), default=0)
        by_retry[retry_count] = {
            "retry_count": retry_count,
            "passed": bool(attrs.get("self_eval.passed", False)),
            "total_score": _as_int(attrs.get("self_eval.total_score"), default=0),
            "scores": {
                "clarity": _as_int(attrs.get("self_eval.score.clarity"), default=0),
                "tone": _as_int(attrs.get("self_eval.score.tone"), default=0),
                "accuracy": _as_int(attrs.get("self_eval.score.accuracy"), default=0),
                "completeness": _as_int(attrs.get("self_eval.score.completeness"), default=0),
            },
            "failed_dimensions": _as_list(attrs.get("self_eval.failed_dimensions")),
        }
    return [by_retry[k] for k in sorted(by_retry)]


def _as_int(value: Any, *, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_list(value: Any) -> list[Any]:
    """Tolerate either a real list (claimit_mcp.phoenix already parsed it) or
    a raw string left over from an unparseable stringified-list attr."""
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if value is None or value == "":
        return []
    return [value]
