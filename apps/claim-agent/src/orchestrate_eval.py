"""Retry loop for self-evaluation — wraps self_evaluate with regeneration logic."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from claimit_mongodb_models import Claim, Policy, Purchase

from src.draft.models import ClaimDraft
from src.self_evaluate import SelfEvalResult, self_evaluate

_log = logging.getLogger(__name__)

MAX_EVAL_RETRIES = 2  # 1 original + 2 retries = 3 total attempts


async def evaluate_and_maybe_regenerate(
    draft: ClaimDraft,
    claim: Claim,
    purchase: Purchase,
    policy: Policy,
    regenerate_fn: Callable[..., Awaitable[ClaimDraft]],
) -> tuple[ClaimDraft, SelfEvalResult, int]:
    """Evaluate draft and regenerate up to MAX_EVAL_RETRIES times if it fails.

    Returns (final_draft, final_result, attempts_used). Always returns the last
    draft and result regardless of pass/fail — caller decides how to handle.
    """
    current_draft = draft
    last_result: SelfEvalResult | None = None
    attempts = 0

    for attempt in range(MAX_EVAL_RETRIES + 1):
        attempts = attempt + 1
        last_result = await self_evaluate(
            current_draft, claim, purchase, policy, retry_count=attempt
        )
        if last_result.passed:
            break
        if attempt < MAX_EVAL_RETRIES:
            feedback = _build_feedback_str(last_result)
            current_draft = await regenerate_fn(current_draft, feedback, claim)
        else:
            _log.error(
                "self_eval.max_retries_exceeded claim_id=%s failed_dims=%s",
                claim.id,
                last_result.failed_dimensions,
            )

    return current_draft, last_result, attempts  # type: ignore[return-value]


def _build_feedback_str(result: SelfEvalResult) -> str:
    if not result.failed_dimensions:
        return ""
    dim_lines = "\n".join(
        f"- {dim}: {result.improvement_suggestions.get(dim, '')}"
        for dim in result.failed_dimensions
    )
    return f"Failed dimensions: {', '.join(result.failed_dimensions)}\n{dim_lines}"
