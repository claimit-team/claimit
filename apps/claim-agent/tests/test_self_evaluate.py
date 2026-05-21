"""Tests for src.self_evaluate and src.orchestrate_eval."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from claimit_mongodb_models import Claim, ClaimType, Policy, Purchase, SelfEvalScore
from src.draft.models import ClaimDraft
from src.orchestrate_eval import evaluate_and_maybe_regenerate
from src.self_evaluate import PASS_THRESHOLD, SelfEvalResult, self_evaluate


def _make_draft(**overrides) -> ClaimDraft:
    return ClaimDraft(
        **{
            "claim_id": uuid4(),
            "draft_content": "Dear Best Buy, I purchased order #BB-12345 ...",
            "subject": "Price Match Request",
            "to_address": "pricematch@bestbuy.com",
            "policy_clause_cited": "Best Buy Price Match Guarantee",
            "platform": "best_buy",
            "claim_type": "email",
            "refund_amount": 20.0,
            "currency": "USD",
            "model_used": "gemini-2.5-flash",
            "draft_version": 1,
            "generated_at": datetime(2026, 1, 15, tzinfo=UTC),
            **overrides,
        }
    )


def _make_claim(**overrides) -> Claim:
    claim = MagicMock(spec=Claim)
    claim.id = uuid4()
    claim.claim_type = ClaimType.EMAIL
    claim.claim_amount = 20.0
    for k, v in overrides.items():
        setattr(claim, k, v)
    return claim


def _make_purchase(**overrides) -> Purchase:
    purchase = MagicMock(spec=Purchase)
    purchase.order_id = "BB-12345"
    purchase.price_paid = 100.0
    purchase.purchase_date = datetime(2026, 1, 1, tzinfo=UTC)
    for k, v in overrides.items():
        setattr(purchase, k, v)
    return purchase


def _make_policy(**overrides) -> Policy:
    policy = MagicMock(spec=Policy)
    policy.policy_text_relevant_clause = "Price match within 15 days of purchase."
    for k, v in overrides.items():
        setattr(policy, k, v)
    return policy


def _agent_response(clarity=8, tone=8, accuracy=8, completeness=8) -> dict:
    """Build a dict matching the _SelfEvalOutput schema."""
    return {
        "rubric_scores": {
            "clarity": clarity,
            "tone": tone,
            "accuracy": accuracy,
            "completeness": completeness,
        },
        "dimension_feedback": {
            "clarity": "Clear and direct.",
            "tone": "Professional tone.",
            "accuracy": "All facts correct.",
            "completeness": "All required fields present.",
        },
        "improvement_suggestions": {
            "clarity": "" if clarity >= PASS_THRESHOLD else f"Improve clarity (score {clarity}).",
            "tone": "" if tone >= PASS_THRESHOLD else f"Adjust tone (score {tone}).",
            "accuracy": "" if accuracy >= PASS_THRESHOLD else f"Fix accuracy (score {accuracy}).",
            "completeness": "" if completeness >= PASS_THRESHOLD else f"Add missing info (score {completeness}).",
        },
    }


def _passing_result(draft: ClaimDraft | None = None) -> SelfEvalResult:
    scores = SelfEvalScore(clarity=8, tone=8, accuracy=8, completeness=8)
    return SelfEvalResult(
        passed=True,
        total_score=32,
        scores=scores,
        failed_dimensions=[],
        dimension_feedback={d: "ok" for d in ("clarity", "tone", "accuracy", "completeness")},
        improvement_suggestions={},
        draft_version=str((draft or _make_draft()).draft_version),
        model_used="gemini-2.5-flash",
    )


def _failing_result(draft: ClaimDraft | None = None) -> SelfEvalResult:
    scores = SelfEvalScore(clarity=5, tone=8, accuracy=8, completeness=8)
    return SelfEvalResult(
        passed=False,
        total_score=29,
        scores=scores,
        failed_dimensions=["clarity"],
        dimension_feedback={d: "feedback" for d in ("clarity", "tone", "accuracy", "completeness")},
        improvement_suggestions={"clarity": "Improve clarity."},
        draft_version=str((draft or _make_draft()).draft_version),
        model_used="gemini-2.5-flash",
    )


# ---------------------------------------------------------------------------
# Test 1 — self_evaluate passes first try
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_self_evaluate_passes_first_try() -> None:
    mock_span = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__ = MagicMock(return_value=mock_span)
    mock_cm.__exit__ = MagicMock(return_value=False)

    with (
        patch("src.self_evaluate._run_self_eval_agent", new_callable=AsyncMock) as mock_run,
        patch("src.self_evaluate.span_with_attributes", return_value=mock_cm),
    ):
        mock_run.return_value = _agent_response()

        result = await self_evaluate(
            _make_draft(), _make_claim(), _make_purchase(), _make_policy()
        )

    assert result.passed is True
    assert result.failed_dimensions == []
    mock_span.set_attribute.assert_any_call("self_eval.passed", True)


# ---------------------------------------------------------------------------
# Test 2 — self_evaluate fails on one dimension
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_self_evaluate_fails_one_dimension() -> None:
    mock_span = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__ = MagicMock(return_value=mock_span)
    mock_cm.__exit__ = MagicMock(return_value=False)

    with (
        patch("src.self_evaluate._run_self_eval_agent", new_callable=AsyncMock) as mock_run,
        patch("src.self_evaluate.span_with_attributes", return_value=mock_cm),
    ):
        mock_run.return_value = _agent_response(clarity=5)

        result = await self_evaluate(
            _make_draft(), _make_claim(), _make_purchase(), _make_policy()
        )

    assert result.passed is False
    assert result.failed_dimensions == ["clarity"]
    assert "clarity" in result.improvement_suggestions


# ---------------------------------------------------------------------------
# Test 3 — evaluate_and_maybe_regenerate passes on attempt 0
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orchestrate_passes_first_attempt() -> None:
    draft = _make_draft()
    mock_regenerate = AsyncMock()

    with patch("src.orchestrate_eval.self_evaluate", new_callable=AsyncMock) as mock_eval:
        mock_eval.return_value = _passing_result(draft)

        _final_draft, final_result, attempts = await evaluate_and_maybe_regenerate(
            draft, _make_claim(), _make_purchase(), _make_policy(),
            regenerate_fn=mock_regenerate,
        )

    assert final_result.passed is True
    assert attempts == 1
    mock_regenerate.assert_not_called()


# ---------------------------------------------------------------------------
# Test 4 — evaluate_and_maybe_regenerate fails attempt 0, passes attempt 1
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orchestrate_fails_then_passes() -> None:
    original_draft = _make_draft()
    regenerated_draft = _make_draft(draft_content="Dear Best Buy, order #BB-12345 improved...")

    mock_regenerate = AsyncMock(return_value=regenerated_draft)

    with patch("src.orchestrate_eval.self_evaluate", new_callable=AsyncMock) as mock_eval:
        mock_eval.side_effect = [
            _failing_result(original_draft),
            _passing_result(regenerated_draft),
        ]

        _final_draft, final_result, attempts = await evaluate_and_maybe_regenerate(
            original_draft, _make_claim(), _make_purchase(), _make_policy(),
            regenerate_fn=mock_regenerate,
        )

    assert final_result.passed is True
    assert attempts == 2
    mock_regenerate.assert_called_once()
