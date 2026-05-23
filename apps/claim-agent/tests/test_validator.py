"""Tests for src.validator — output validation checks."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

from claimit_mongodb_models import Claim, ClaimType, Purchase
from src.draft.models import ClaimDraft
from src.validator import validate


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
    for k, v in overrides.items():
        setattr(purchase, k, v)
    return purchase


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_valid_draft_passes() -> None:
    result = validate(_make_draft(), _make_claim(), _make_purchase())
    assert result.valid is True
    assert result.issues == []


def test_validate_accepts_str_claim_type_from_mongo_read() -> None:
    claim = _make_claim(claim_type="email")
    result = validate(_make_draft(), claim, _make_purchase())
    assert result.valid is True


# ---------------------------------------------------------------------------
# Check 1 — Unresolved placeholders
# ---------------------------------------------------------------------------


def test_unresolved_placeholder_detected() -> None:
    draft = _make_draft(draft_content="Dear Best Buy, order #BB-12345 {{STORE_ADDRESS}} ...")
    result = validate(draft, _make_claim(), _make_purchase())
    assert result.valid is False
    assert any("Unresolved placeholders" in issue for issue in result.issues)


def test_multiple_placeholders_all_reported() -> None:
    draft = _make_draft(
        draft_content="Dear Best Buy, order #BB-12345 {{STORE_ADDRESS}} and {{MANAGER_NAME}} ..."
    )
    result = validate(draft, _make_claim(), _make_purchase())
    assert result.valid is False
    placeholder_issues = [i for i in result.issues if "Unresolved placeholders" in i]
    assert len(placeholder_issues) == 1
    assert "{{STORE_ADDRESS}}" in placeholder_issues[0]
    assert "{{MANAGER_NAME}}" in placeholder_issues[0]


# ---------------------------------------------------------------------------
# Check 2 — Order ID mismatch
# ---------------------------------------------------------------------------


def test_order_id_mismatch_detected() -> None:
    purchase = _make_purchase(order_id="BB-99999")
    result = validate(_make_draft(), _make_claim(), purchase)
    assert result.valid is False
    assert any("BB-99999" in issue for issue in result.issues)


def test_order_id_empty_skips_check() -> None:
    purchase = _make_purchase(order_id="")
    result = validate(_make_draft(), _make_claim(), purchase)
    assert result.valid is True
    assert not any("not found in draft content" in issue for issue in result.issues)


# ---------------------------------------------------------------------------
# Check 3 — Numeric bounds
# ---------------------------------------------------------------------------


def test_refund_amount_too_high_detected() -> None:
    draft = _make_draft(refund_amount=2000.0)
    claim = _make_claim(claim_amount=20.0)
    result = validate(draft, claim, _make_purchase())
    assert result.valid is False
    assert any("implausible" in issue for issue in result.issues)


def test_refund_amount_within_bounds_passes() -> None:
    draft = _make_draft(refund_amount=22.0)
    claim = _make_claim(claim_amount=20.0)
    result = validate(draft, claim, _make_purchase())
    assert result.valid is True
    assert not any("implausible" in issue for issue in result.issues)


# ---------------------------------------------------------------------------
# Check 4 — Prohibited language
# ---------------------------------------------------------------------------


def test_prohibited_language_legal_threat() -> None:
    draft = _make_draft(
        draft_content="Dear Best Buy, order #BB-12345. I will sue you if this is not resolved."
    )
    result = validate(draft, _make_claim(), _make_purchase())
    assert result.valid is False
    assert any("sue you" in issue for issue in result.issues)


def test_prohibited_language_personal_info() -> None:
    draft = _make_draft(
        draft_content="Dear Best Buy, order #BB-12345. My credit card number is ..."
    )
    result = validate(draft, _make_claim(), _make_purchase())
    assert result.valid is False
    assert any("credit card number" in issue for issue in result.issues)


# ---------------------------------------------------------------------------
# Multi-issue collection
# ---------------------------------------------------------------------------


def test_multiple_issues_all_collected() -> None:
    draft = _make_draft(
        draft_content="Dear Best Buy, order #BB-12345 {{STORE_ADDRESS}}. I will sue you."
    )
    result = validate(draft, _make_claim(), _make_purchase())
    assert result.valid is False
    assert len(result.issues) == 2
