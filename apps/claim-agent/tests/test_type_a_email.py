"""Tests for Type A (email) draft generator — Hilton, Marriott, and hotel-alt scenarios.

Note: Hyatt is not in the Platform enum, so the third scenario uses Hilton with
a distinct refund amount and room type to exercise the same code path.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from claimit_mongodb_models import (
    Claim,
    ClaimOutcome,
    ClaimType,
    DraftGeneratedBy,
    DraftVersion,
    ExtractionConfidence,
    IngestionSource,
    Platform,
    Policy,
    Purchase,
    PurchaseDateBasis,
    PurchaseStatus,
)
from src.draft.models import ClaimDraft
from src.draft.type_a_email import DraftGenerationError, generate_email_draft

_NOW = datetime(2026, 3, 15, tzinfo=UTC)
_CHECK_IN = datetime(2026, 4, 10, tzinfo=UTC)
_WINDOW_EXPIRES = datetime(2026, 4, 25, tzinfo=UTC)

# Template returned by the mocked Gemini runner — contains every placeholder token.
# After replacement none should survive in the final draft.
_MOCK_TEMPLATE = json.dumps(
    {
        "subject": "Price Match Refund Request — Booking {{ORDER_ID}}",
        "email_body": (
            "Dear {{USER_NAME}},\n\n"
            "I am writing to request a price match refund for my booking {{ORDER_ID}}, "
            "covering the period {{CHECK_IN_DATE}} through {{CHECKOUT_DATE}}.\n\n"
            "At the time of booking I paid {{ORIGINAL_PRICE}}, but the same room is now "
            "available at {{CURRENT_PRICE}}. I respectfully request a refund of {{REFUND_AMOUNT}}.\n\n"
            "Pursuant to your policy: {{POLICY_CITATION}}\n\n"
            "Thank you for your assistance.\n\nSincerely,\n{{USER_NAME}}"
        ),
    }
)


# ─── Builders ────────────────────────────────────────────────────────────────


def _make_purchase(
    platform: Platform,
    price_paid: float = 300.0,
    order_id: str = "TEST-ORDER-001",
) -> Purchase:
    return Purchase(
        _id=uuid4(),
        user_id=uuid4(),
        platform=platform,
        category="hotel",
        product_name="Deluxe King Room",
        product_id="room-deluxe-king",
        product_url=None,
        variant=None,
        fare_class=None,
        room_type="King",
        bed_type="King",
        rate_type="standard",
        price_paid=price_paid,
        member_price_at_purchase=None,
        non_member_price_at_purchase=None,
        currency="USD",
        purchase_date=_CHECK_IN,
        purchase_date_basis=PurchaseDateBasis.CHECK_IN_DATE,
        window_expires=_WINDOW_EXPIRES,
        order_id=order_id,
        member_tier_at_purchase=None,
        status=PurchaseStatus.MONITORING,
        claim_type=ClaimType.EMAIL,
        monitoring_cadence_minutes=360,
        ingested_at=_NOW,
        ingestion_source=IngestionSource.GMAIL,
        receipt_storage_url=None,
        receipt_hash=None,
        extraction_confidence=ExtractionConfidence(platform=0.95, price=0.95, overall_min=0.90),
    )


def _make_claim(purchase: Purchase, claim_amount: float = 50.0) -> Claim:
    placeholder = "Draft pending."
    return Claim(
        _id=uuid4(),
        purchase_id=purchase.id,
        user_id=purchase.user_id,
        platform=purchase.platform,
        claim_amount=claim_amount,
        currency="USD",
        claim_type=ClaimType.EMAIL,
        draft_content=placeholder,
        draft_versions=[
            DraftVersion(
                version=1,
                content=placeholder,
                generated_by=DraftGeneratedBy.AGENT,
                at=_NOW,
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
        trace_id="evt-test-001",
    )


def _make_policy(
    platform: Platform,
    claim_email: str | None,
    clause: str,
) -> Policy:
    return Policy(
        _id=uuid4(),
        platform=platform,
        category="hotel",
        window_days=15,
        window_days_member=30,
        pre_arrival_hours_required=24,
        covers_own_drops=True,
        covers_competitor_drops=False,
        claim_type=ClaimType.EMAIL,
        claim_url=None,
        claim_email=claim_email,
        claim_phone=None,
        loyalty_required=False,
        award_ticket_eligible=None,
        bundle_exclusions=True,
        key_exclusions=[],
        policy_url="https://example.com/policy",
        policy_text_full="Full policy text placeholder.",
        policy_text_relevant_clause=clause,
        last_verified=_NOW,
        active=True,
    )


def _mock_search_client(clause: str) -> AsyncMock:
    mock = AsyncMock()
    mock.search_policies.return_value = [{"policy_text_relevant_clause": clause}]
    return mock


# ─── Shared assertions ────────────────────────────────────────────────────────


def _assert_clean_draft(draft: ClaimDraft, claim: Claim, expected_to: str) -> None:
    assert "{{" not in draft.draft_content, "Unreplaced placeholder in draft_content"
    assert "{{" not in draft.subject, "Unreplaced placeholder in subject"
    assert draft.claim_type == "email"
    assert draft.refund_amount == claim.claim_amount
    assert draft.policy_clause_cited
    assert draft.subject
    assert draft.to_address == expected_to


# ─── Scenarios ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_hilton_scenario() -> None:
    clause = (
        "Hilton Best Rate Guarantee: Book directly on Hilton.com and we guarantee "
        "the lowest available rate. If you find a lower publicly available rate within "
        "24 hours of booking, we will match it and provide an additional 25% discount."
    )
    purchase = _make_purchase(Platform.HILTON, price_paid=300.0, order_id="HILTON-789012")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", clause)
    mock_search = _mock_search_client(clause)

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(
            claim, purchase, policy, mock_search, user_name="Jane Smith"
        )

    _assert_clean_draft(draft, claim, policy.claim_email or "")
    assert "HILTON-789012" in draft.draft_content
    assert "HILTON-789012" in draft.subject
    assert draft.platform == "hilton"


@pytest.mark.asyncio
async def test_marriott_scenario() -> None:
    clause = (
        "Marriott Best Rate Guarantee: Marriott Bonvoy members who book direct are "
        "eligible for a rate match if a lower publicly available rate for the same "
        "room type is found within the booking window."
    )
    purchase = _make_purchase(Platform.MARRIOTT, price_paid=420.0, order_id="MARRIOTT-456789")
    claim = _make_claim(purchase, claim_amount=70.0)
    policy = _make_policy(Platform.MARRIOTT, "guestservices@marriott.com", clause)
    mock_search = _mock_search_client(clause)

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(
            claim, purchase, policy, mock_search, user_name="Robert Chen"
        )

    _assert_clean_draft(draft, claim, policy.claim_email or "")
    assert "MARRIOTT-456789" in draft.draft_content
    assert draft.platform == "marriott"
    assert draft.refund_amount == 70.0


@pytest.mark.asyncio
async def test_hilton_suite_scenario() -> None:
    # Hyatt is not in the Platform enum; this third scenario uses Hilton with
    # a higher refund amount (suite booking) to cover the required third case.
    clause = (
        "Best Rate Guarantee: Applies when the identical room type, rate conditions, "
        "and stay dates are met and a lower publicly available rate is verifiable "
        "at the time the claim is submitted."
    )
    purchase = _make_purchase(Platform.HILTON, price_paid=800.0, order_id="HILTON-SUITE-9999")
    claim = _make_claim(purchase, claim_amount=150.0)
    policy = _make_policy(Platform.HILTON, "pricematch@hilton.com", clause)
    mock_search = _mock_search_client(clause)

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(
            claim, purchase, policy, mock_search, user_name="Alice Johnson"
        )

    _assert_clean_draft(draft, claim, policy.claim_email or "")
    assert draft.refund_amount == 150.0
    assert "HILTON-SUITE-9999" in draft.draft_content


@pytest.mark.asyncio
async def test_empty_search_results_uses_policy_fallback() -> None:
    """When search_policies returns no results, policy.policy_text_relevant_clause is used."""
    fallback_clause = "Fallback guarantee: We match any lower rate found for the same booking."
    purchase = _make_purchase(Platform.HILTON, price_paid=200.0, order_id="HILTON-FALLBACK-001")
    claim = _make_claim(purchase, claim_amount=30.0)
    policy = _make_policy(Platform.HILTON, "info@hilton.com", fallback_clause)

    empty_search = AsyncMock()
    empty_search.search_policies.return_value = []

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(
            claim, purchase, policy, empty_search, user_name="Test User"
        )

    assert "{{" not in draft.draft_content
    assert "{{" not in draft.subject
    assert draft.policy_clause_cited == fallback_clause
    assert draft.refund_amount == 30.0


@pytest.mark.asyncio
async def test_post_fill_placeholder_guard() -> None:
    """generate_email_draft raises DraftGenerationError if filled output still has {{ tokens."""
    purchase = _make_purchase(Platform.HILTON, price_paid=300.0, order_id="HILTON-001")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", "Some clause.")
    mock_search = _mock_search_client("Some clause.")

    bad_template = json.dumps(
        {
            "subject": "Price Match — {{ORDER_ID}}",
            "email_body": "Dear {{USER_NAME}}, this contains {{UNKNOWN}}.",
        }
    )

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = bad_template
        with pytest.raises(DraftGenerationError, match="unreplaced placeholder"):
            await generate_email_draft(claim, purchase, policy, mock_search)


@pytest.mark.asyncio
async def test_invalid_gemini_schema() -> None:
    """generate_email_draft raises DraftGenerationError when JSON is missing required fields."""
    purchase = _make_purchase(Platform.HILTON, price_paid=300.0, order_id="HILTON-001")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", "Some clause.")
    mock_search = _mock_search_client("Some clause.")

    bad_output = json.dumps({"email_body": "some body"})

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = bad_output
        with pytest.raises(DraftGenerationError):
            await generate_email_draft(claim, purchase, policy, mock_search)


@pytest.mark.asyncio
async def test_best_buy_null_claim_email_uses_platform_default() -> None:
    """Missing policy.claim_email falls back to the known best_buy default."""
    clause = "Best Buy price match within 15 days."
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=399.99, order_id="BBY-001")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.BEST_BUY, None, clause)
    mock_search = _mock_search_client(clause)

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(claim, purchase, policy, mock_search)

    assert draft.to_address == "pricematch@bestbuy.com"
    assert "{{" not in draft.draft_content


@pytest.mark.asyncio
async def test_unknown_platform_null_claim_email_uses_generic_fallback() -> None:
    """Unlisted platforms degrade to a generic claim email instead of raising."""
    clause = "Generic price match clause."
    purchase = _make_purchase(Platform.AMERICAN, price_paid=100.0, order_id="UNK-001")
    claim = _make_claim(purchase, claim_amount=10.0)
    policy = _make_policy(Platform.AMERICAN, None, clause)
    mock_search = _mock_search_client(clause)

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(claim, purchase, policy, mock_search)

    assert draft.to_address == "priceadjustments@american.example.com"


@pytest.mark.asyncio
async def test_search_exception_uses_fallback() -> None:
    """When search_policies raises an exception, falls back to policy.policy_text_relevant_clause."""
    clause = "Fallback guarantee clause."
    purchase = _make_purchase(Platform.HILTON, price_paid=300.0, order_id="HILTON-001")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", clause)

    failing_search = AsyncMock()
    failing_search.search_policies.side_effect = Exception("network error")

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(claim, purchase, policy, failing_search)

    assert draft.policy_clause_cited == clause


@pytest.mark.asyncio
async def test_currency_formatting() -> None:
    """Prices appear in the draft as $NNN.NN formatted strings."""
    purchase = _make_purchase(Platform.HILTON, price_paid=300.0, order_id="HILTON-FMT-001")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", "Some clause.")
    mock_search = _mock_search_client("Some clause.")

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_email_draft(claim, purchase, policy, mock_search)

    assert "$300.00" in draft.draft_content
    assert "$250.00" in draft.draft_content
    assert "$50.00" in draft.draft_content
