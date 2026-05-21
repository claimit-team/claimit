"""Self-evaluation pass — Gemini quality check on generated claim drafts."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from uuid import uuid4

from claimit_mongodb_models import Claim, Policy, Purchase, SelfEvalScore
from claimit_observability import get_tracer, span_with_attributes
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

from src.draft._shared import (
    MODEL_NAME,
    DraftGenerationError,
    _extract_event_text,
    _maybe_await,
    _strip_json_fence,
)
from src.draft.models import ClaimDraft

_log = logging.getLogger(__name__)

PASS_THRESHOLD = 7
_APP_NAME = "claimit-self-eval"
_EVAL_TIMEOUT_SECONDS = 30
_DIMENSIONS = ("clarity", "tone", "accuracy", "completeness")

_EVAL_SYSTEM_PROMPT = """
You are a quality evaluator for price-match refund claim drafts.

Score the provided draft on exactly 4 dimensions, each from 0 to 10:
- clarity: Is the request clear and unambiguous?
- tone: Is the language professional, polite, and appropriate for the claim type?
- accuracy: Are all factual details (order ID, dates, prices, refund amount) correct and present?
- completeness: Does the draft include all required information for the claim?

Return ONLY a valid JSON object with this exact structure:
{
  "rubric_scores": {
    "clarity": <integer 0-10>,
    "tone": <integer 0-10>,
    "accuracy": <integer 0-10>,
    "completeness": <integer 0-10>
  },
  "dimension_feedback": {
    "clarity": "<explanation of what was found>",
    "tone": "<explanation of what was found>",
    "accuracy": "<explanation of what was found>",
    "completeness": "<explanation of what was found>"
  },
  "improvement_suggestions": {
    "clarity": "<specific fix instructions, or empty string if score >= 7>",
    "tone": "<specific fix instructions, or empty string if score >= 7>",
    "accuracy": "<specific fix instructions, or empty string if score >= 7>",
    "completeness": "<specific fix instructions, or empty string if score >= 7>"
  }
}

Only populate improvement_suggestions for dimensions that scored below 7.
Leave other improvement_suggestion fields as empty strings.
No prose outside the JSON. No markdown fences. Only the JSON object.
""".strip()


class _RubricScores(BaseModel):
    clarity: int = Field(ge=0, le=10)
    tone: int = Field(ge=0, le=10)
    accuracy: int = Field(ge=0, le=10)
    completeness: int = Field(ge=0, le=10)


class _DimensionFeedback(BaseModel):
    clarity: str
    tone: str
    accuracy: str
    completeness: str


class _ImprovementSuggestions(BaseModel):
    clarity: str = ""
    tone: str = ""
    accuracy: str = ""
    completeness: str = ""


class _SelfEvalOutput(BaseModel):
    rubric_scores: _RubricScores
    dimension_feedback: _DimensionFeedback
    improvement_suggestions: _ImprovementSuggestions


@dataclass
class SelfEvalResult:
    passed: bool
    total_score: int
    scores: SelfEvalScore
    failed_dimensions: list[str] = field(default_factory=list)
    dimension_feedback: dict[str, str] = field(default_factory=dict)
    improvement_suggestions: dict[str, str] = field(default_factory=dict)
    draft_version: str = ""
    model_used: str = MODEL_NAME


async def self_evaluate(
    draft: ClaimDraft,
    claim: Claim,
    purchase: Purchase,
    policy: Policy,
    *,
    retry_count: int = 0,
) -> SelfEvalResult:
    """
    Single Gemini eval call. Does NOT retry — caller controls retry loop.
    Pass criteria: ALL 4 dimensions >= PASS_THRESHOLD (7).
    """
    tracer = get_tracer(__name__)
    with span_with_attributes(
        tracer,
        "self_evaluate.evaluate",
        {
            "claim.id": str(claim.id),
            "draft.version": draft.draft_version,
            "self_eval.retry_count": retry_count,
        },
    ) as span:
        payload = {
            "claim_id": str(claim.id),
            "draft_content": draft.draft_content,
            "draft_version": draft.draft_version,
            "claim_type": draft.claim_type,
            "platform": draft.platform,
            "policy_text": policy.policy_text_relevant_clause,
            "purchase_data": {
                "order_id": purchase.order_id,
                "purchase_date": purchase.purchase_date.isoformat(),
                "original_price": purchase.price_paid,
                "current_price": round(purchase.price_paid - claim.claim_amount, 2),
                "refund_amount": claim.claim_amount,
            },
            "retry_count": retry_count,
        }

        raw = await _run_self_eval_agent(payload)

        scores = SelfEvalScore(
            clarity=raw["rubric_scores"]["clarity"],
            tone=raw["rubric_scores"]["tone"],
            accuracy=raw["rubric_scores"]["accuracy"],
            completeness=raw["rubric_scores"]["completeness"],
        )

        failed_dimensions = [dim for dim in _DIMENSIONS if getattr(scores, dim) < PASS_THRESHOLD]
        passed = len(failed_dimensions) == 0
        total_score = scores.clarity + scores.tone + scores.accuracy + scores.completeness

        improvement_suggestions = {
            dim: raw["improvement_suggestions"].get(dim, "")
            for dim in failed_dimensions
        }

        span.set_attribute("self_eval.passed", passed)
        span.set_attribute("self_eval.total_score", total_score)
        span.set_attribute("self_eval.failed_dimensions", str(failed_dimensions))
        span.set_attribute("self_eval.score.clarity", scores.clarity)
        span.set_attribute("self_eval.score.tone", scores.tone)
        span.set_attribute("self_eval.score.accuracy", scores.accuracy)
        span.set_attribute("self_eval.score.completeness", scores.completeness)

        return SelfEvalResult(
            passed=passed,
            total_score=total_score,
            scores=scores,
            failed_dimensions=failed_dimensions,
            dimension_feedback=dict(raw["dimension_feedback"]),
            improvement_suggestions=improvement_suggestions,
            draft_version=str(draft.draft_version),
            model_used=MODEL_NAME,
        )


async def _run_self_eval_agent(payload: dict) -> dict:
    """
    Mirror _run_draft_agent from draft/_shared.py.
    Use same MODEL_NAME. Return parsed dict matching YAML output shape.
    Must use structured JSON output (response_schema), not freeform parsing.
    """
    session_service = InMemorySessionService()
    session_id = f"self-eval-{uuid4()}"
    user_id = "claim-self-evaluator"

    await _maybe_await(
        session_service.create_session(
            app_name=_APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
    )

    agent = Agent(
        name="self_evaluator",
        model=MODEL_NAME,
        instruction=_EVAL_SYSTEM_PROMPT,
        output_schema=_SelfEvalOutput,
        tools=[],
    )

    runner = Runner(
        app_name=_APP_NAME,
        agent=agent,
        session_service=session_service,
    )
    message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=json.dumps(payload, ensure_ascii=False))],
    )

    final_text: str | None = None
    try:
        async with asyncio.timeout(_EVAL_TIMEOUT_SECONDS):
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
            ):
                if event.is_final_response():
                    final_text = _extract_event_text(event)
    except TimeoutError as exc:
        raise DraftGenerationError(f"Self-eval timed out for session {session_id}") from exc

    if not final_text or not final_text.strip():
        raise DraftGenerationError("Self-evaluator returned empty output")

    try:
        raw = json.loads(_strip_json_fence(final_text))
    except json.JSONDecodeError as exc:
        raise DraftGenerationError("Self-evaluator returned malformed JSON") from exc

    try:
        parsed = _SelfEvalOutput.model_validate(raw)
    except ValidationError as exc:
        raise DraftGenerationError("Self-evaluator returned invalid output schema") from exc

    return parsed.model_dump()
