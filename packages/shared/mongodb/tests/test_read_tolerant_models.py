"""Round-trip + no-write-regression tests for the read-tolerant variants.

The contract under test (PR #142):

- The tolerant variants (`ClaimReadTolerant`, `PurchaseReadTolerant`)
  accept rogue enum values, missing/null required scalars, and broken
  Claim invariants WITHOUT raising.
- The strict variants (`Claim`, `Purchase`) still REJECT every one of
  those malformed shapes — that's the no-write-regression guarantee:
  you cannot accidentally write a malformed doc by routing a tolerant
  instance back through the write path.

Each test asserts BOTH halves so a future refactor that loosens write
validation by mistake fails loudly.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from claimit_mongodb_models import (
    Claim,
    ClaimReadTolerant,
    Purchase,
    PurchaseReadTolerant,
)
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Helpers — minimal valid docs to mutate per scenario.
# ---------------------------------------------------------------------------


def _valid_claim_doc() -> dict:
    """Schema-valid Claim doc — round-trips through both Claim and ClaimReadTolerant."""
    now = datetime.now(UTC)
    draft_content = "Hello from the test."
    return {
        "_id": uuid4(),
        "updated_at": now,
        "purchase_id": uuid4(),
        "user_id": uuid4(),
        "platform": "best_buy",
        "claim_amount": 50.0,
        "currency": "USD",
        "claim_type": "email",
        "draft_content": draft_content,
        "draft_versions": [
            {
                "version": 1,
                "content": draft_content,
                "generated_by": "agent",
                "at": now,
            }
        ],
        "redraft_count": 0,
        "policy_clause_cited": "15-day price match.",
        "evidence_screenshot_url": None,
        "send_override": None,
        "submitted_at": None,
        "submitted_via": None,
        "outcome": "draft_pending",
        "outcome_note": None,
        "denial_reason_extracted": None,
        "resolved_at": None,
        "trace_id": "trace-test-001",
    }


def _valid_purchase_doc() -> dict:
    """Schema-valid Purchase doc — round-trips through both Purchase and tolerant."""
    now = datetime.now(UTC)
    return {
        "_id": uuid4(),
        "updated_at": now,
        "user_id": uuid4(),
        "platform": "best_buy",
        "category": "retail",
        "product_name": "Sony WH-1000XM5",
        "product_id": "BBY-987654",
        "product_url": None,
        "variant": None,
        "fare_class": None,
        "room_type": None,
        "bed_type": None,
        "rate_type": None,
        "price_paid": 299.99,
        "member_price_at_purchase": None,
        "non_member_price_at_purchase": None,
        "currency": "USD",
        "purchase_date": now,
        "purchase_date_basis": "order_date",
        "window_expires": now,
        "order_id": "ord-001",
        "member_tier_at_purchase": None,
        "status": "monitoring",
        "claim_type": "email",
        "monitoring_cadence_minutes": 60,
        "last_checked_at": None,
        "ingested_at": now,
        "ingestion_source": "gmail",
        "receipt_storage_url": None,
        "receipt_hash": None,
        "format_hash": None,
        "sender": None,
        "extraction_confidence": {
            "platform": 1.0,
            "price": 1.0,
            "overall_min": 1.0,
        },
    }


# ---------------------------------------------------------------------------
# Claim — round-trip + strict-still-rejects pairs.
# ---------------------------------------------------------------------------


class TestClaimReadTolerant:
    def test_valid_doc_round_trips_through_both_variants(self) -> None:
        """Valid claim deserialises through tolerant AND strict — no behaviour
        change for non-legacy data."""
        doc = _valid_claim_doc()
        # Both should accept it.
        tolerant = ClaimReadTolerant.model_validate(doc)
        strict = Claim.model_validate(doc)
        # Same field values land in both instances.
        assert tolerant.id == strict.id
        assert tolerant.outcome == strict.outcome.value
        assert tolerant.platform == strict.platform.value
        assert tolerant.claim_amount == strict.claim_amount

    def test_rogue_claim_type_passes_tolerant_rejects_strict(self) -> None:
        """The rogue case from the PR #141 follow-up: `claim_type` carries a
        legacy value (`price_drop_refund`) that's no longer in `ClaimType`."""
        doc = _valid_claim_doc()
        doc["claim_type"] = "price_drop_refund"

        tolerant = ClaimReadTolerant.model_validate(doc)
        # Verbatim pass-through: not None, not coerced.
        assert tolerant.claim_type == "price_drop_refund"

        with pytest.raises(ValidationError) as excinfo:
            Claim.model_validate(doc)
        # Failure must specifically be on `claim_type` — confirms the
        # strict gate is intact.
        errors = excinfo.value.errors()
        assert any("claim_type" in e["loc"] for e in errors)

    def test_rogue_outcome_passes_tolerant_rejects_strict(self) -> None:
        doc = _valid_claim_doc()
        doc["outcome"] = "frozen_pending"

        tolerant = ClaimReadTolerant.model_validate(doc)
        assert tolerant.outcome == "frozen_pending"

        with pytest.raises(ValidationError):
            Claim.model_validate(doc)

    def test_null_required_scalar_passes_tolerant_rejects_strict(self) -> None:
        """`claim_amount` is required on Claim (`gt=0`); null surfaces as None
        on tolerant rather than 500ing the read."""
        doc = _valid_claim_doc()
        doc["claim_amount"] = None

        tolerant = ClaimReadTolerant.model_validate(doc)
        assert tolerant.claim_amount is None

        with pytest.raises(ValidationError):
            Claim.model_validate(doc)

    def test_zero_claim_amount_passes_tolerant_rejects_strict(self) -> None:
        """The strict `Field(gt=0)` constraint is dropped on tolerant so a
        legacy doc with zero amount loads."""
        doc = _valid_claim_doc()
        doc["claim_amount"] = 0.0

        tolerant = ClaimReadTolerant.model_validate(doc)
        assert tolerant.claim_amount == 0.0

        with pytest.raises(ValidationError):
            Claim.model_validate(doc)

    def test_draft_invariant_violation_passes_tolerant_rejects_strict(self) -> None:
        """The `draft_content == draft_versions[-1].content` invariant on
        Claim is a `@model_validator(after)`; tolerant variant doesn't
        replicate it."""
        doc = _valid_claim_doc()
        doc["draft_content"] = "Newer text not in the versions list."
        # draft_versions[-1].content unchanged → invariant violated.

        tolerant = ClaimReadTolerant.model_validate(doc)
        assert tolerant.draft_content == "Newer text not in the versions list."

        with pytest.raises(ValidationError):
            Claim.model_validate(doc)

    def test_empty_draft_versions_passes_tolerant_rejects_strict(self) -> None:
        """`draft_versions: list[DraftVersion] = Field(min_length=1)` on
        strict; tolerant drops the constraint and uses a default empty list."""
        doc = _valid_claim_doc()
        doc["draft_versions"] = []
        # Set draft_content to empty too, to also exercise required-scalar widening.
        doc["draft_content"] = ""

        tolerant = ClaimReadTolerant.model_validate(doc)
        assert tolerant.draft_versions == []

        with pytest.raises(ValidationError):
            Claim.model_validate(doc)

    def test_negative_redraft_count_passes_tolerant_rejects_strict(self) -> None:
        """The strict `Field(ge=0)` on `redraft_count` is dropped on tolerant."""
        doc = _valid_claim_doc()
        doc["redraft_count"] = -3

        tolerant = ClaimReadTolerant.model_validate(doc)
        assert tolerant.redraft_count == -3

        with pytest.raises(ValidationError):
            Claim.model_validate(doc)


# ---------------------------------------------------------------------------
# Purchase — round-trip + strict-still-rejects pairs.
# ---------------------------------------------------------------------------


class TestPurchaseReadTolerant:
    def test_valid_doc_round_trips_through_both_variants(self) -> None:
        doc = _valid_purchase_doc()
        tolerant = PurchaseReadTolerant.model_validate(doc)
        strict = Purchase.model_validate(doc)
        assert tolerant.id == strict.id
        assert tolerant.platform == strict.platform.value
        assert tolerant.category == strict.category.value
        assert tolerant.price_paid == strict.price_paid

    def test_rogue_purchase_audit_doc_passes_tolerant_rejects_strict(self) -> None:
        """The exact rogue Purchase shape from the §3 audit: `category=None`,
        `product_name=None`, `claim_type=None`. All three are required on the
        strict model; tolerant accepts them."""
        doc = _valid_purchase_doc()
        doc["category"] = None
        doc["product_name"] = None
        doc["claim_type"] = None

        tolerant = PurchaseReadTolerant.model_validate(doc)
        assert tolerant.category is None
        assert tolerant.product_name is None
        assert tolerant.claim_type is None

        with pytest.raises(ValidationError) as excinfo:
            Purchase.model_validate(doc)
        # All three fields should fire on strict.
        loc_keys = {e["loc"][0] for e in excinfo.value.errors() if e["loc"]}
        assert "category" in loc_keys
        assert "product_name" in loc_keys
        assert "claim_type" in loc_keys

    def test_rogue_platform_string_passes_tolerant_rejects_strict(self) -> None:
        doc = _valid_purchase_doc()
        doc["platform"] = "rogue_marketplace"

        tolerant = PurchaseReadTolerant.model_validate(doc)
        assert tolerant.platform == "rogue_marketplace"

        with pytest.raises(ValidationError):
            Purchase.model_validate(doc)

    def test_zero_price_paid_passes_tolerant_rejects_strict(self) -> None:
        """`Field(gt=0)` on Purchase.price_paid; tolerant drops it."""
        doc = _valid_purchase_doc()
        doc["price_paid"] = 0.0

        tolerant = PurchaseReadTolerant.model_validate(doc)
        assert tolerant.price_paid == 0.0

        with pytest.raises(ValidationError):
            Purchase.model_validate(doc)

    def test_null_window_expires_passes_tolerant_rejects_strict(self) -> None:
        doc = _valid_purchase_doc()
        doc["window_expires"] = None

        tolerant = PurchaseReadTolerant.model_validate(doc)
        assert tolerant.window_expires is None

        with pytest.raises(ValidationError):
            Purchase.model_validate(doc)

    def test_extraction_confidence_out_of_range_passes_tolerant_rejects_strict(
        self,
    ) -> None:
        """`Field(ge=0.0, le=1.0)` on every confidence score; tolerant drops them."""
        doc = _valid_purchase_doc()
        doc["extraction_confidence"] = {
            "platform": 1.5,
            "price": -0.2,
            "overall_min": 99.0,
        }

        tolerant = PurchaseReadTolerant.model_validate(doc)
        assert tolerant.extraction_confidence is not None
        assert tolerant.extraction_confidence.platform == 1.5
        assert tolerant.extraction_confidence.price == -0.2

        with pytest.raises(ValidationError):
            Purchase.model_validate(doc)
