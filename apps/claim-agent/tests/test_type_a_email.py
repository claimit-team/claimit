"""Tests for Type A (email) draft generator — retail, hotel, and airline scenarios."""

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
from src.draft._shared import _normalize_draft_prose
from src.draft.models import ClaimDraft
from src.draft.type_a_email import DraftGenerationError, generate_email_draft

_NOW = datetime(2026, 3, 15, tzinfo=UTC)
_CHECK_IN = datetime(2026, 4, 10, tzinfo=UTC)
_WINDOW_EXPIRES = datetime(2026, 4, 25, tzinfo=UTC)

_MOCK_RETAIL_TEMPLATE = json.dumps(
    {
        "subject": "Price Match Refund Request — Order {{ORDER_ID}}",
        "email_body": (
            "Hello {{MERCHANT_NAME}} Customer Care,\n\n"
            "I'm writing to request a price match refund on a recent purchase.\n\n"
            "Order {{ORDER_ID}} — {{PRODUCT_NAME}} at {{ORIGINAL_PRICE}}. The current price is "
            "{{CURRENT_PRICE}}, a difference of {{REFUND_AMOUNT}} within the published price-match window.\n\n"
            "Pursuant to your policy: {{POLICY_CITATION}}\n\n"
            "Thank you,\n{{USER_NAME}}"
        ),
    }
)

_MOCK_HOTEL_TEMPLATE = json.dumps(
    {
        "subject": "Price Match Refund Request — Booking {{ORDER_ID}}",
        "email_body": (
            "Hello {{MERCHANT_NAME}} Reservations,\n\n"
            "I am writing to request a price match refund for my booking {{ORDER_ID}}, "
            "covering the period {{CHECK_IN_DATE}} through {{CHECKOUT_DATE}}.\n\n"
            "At the time of booking I paid {{ORIGINAL_PRICE}}, but the same room is now "
            "available at {{CURRENT_PRICE}}. I respectfully request a refund of {{REFUND_AMOUNT}}.\n\n"
            "Pursuant to your policy: {{POLICY_CITATION}}\n\n"
            "Thank you,\n{{USER_NAME}}"
        ),
    }
)


def _make_purchase(
    platform: Platform,
    *,
    category: str = "hotel",
    price_paid: float = 300.0,
    order_id: str = "TEST-ORDER-001",
    product_name: str = "Deluxe King Room",
) -> Purchase:
    return Purchase(
        _id=uuid4(),
        user_id=uuid4(),
        platform=platform,
        category=category,
        product_name=product_name,
        product_id="sku-001",
        product_url=None,
        variant=None,
        fare_class=None,
        room_type="King" if category == "hotel" else None,
        bed_type="King" if category == "hotel" else None,
        rate_type="standard" if category == "hotel" else None,
        price_paid=price_paid,
        member_price_at_purchase=None,
        non_member_price_at_purchase=None,
        currency="USD",
        purchase_date=_CHECK_IN,
        purchase_date_basis=PurchaseDateBasis.CHECK_IN_DATE
        if category == "hotel"
        else PurchaseDateBasis.ORDER_DATE,
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
    *,
    category: str = "hotel",
) -> Policy:
    return Policy(
        _id=uuid4(),
        platform=platform,
        category=category,
        window_days=15,
        window_days_member=30,
        pre_arrival_hours_required=24 if category == "hotel" else None,
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


def _assert_clean_draft(draft: ClaimDraft, claim: Claim, expected_to: str) -> None:
    assert "{{" not in draft.draft_content
    assert "{{" not in draft.subject
    assert draft.claim_type == "email"
    assert draft.refund_amount == claim.claim_amount
    assert draft.policy_clause_cited
    assert draft.subject
    assert draft.to_address == expected_to


@pytest.mark.asyncio
async def test_best_buy_retail_scenario() -> None:
    clause = "Best Buy price match within 15 days."
    purchase = _make_purchase(
        Platform.BEST_BUY,
        category="retail",
        price_paid=399.99,
        order_id="BBY-001",
        product_name="Sony WH-1000XM5",
    )
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.BEST_BUY, None, clause, category="retail")
    mock_search = _mock_search_client("Hilton clause that must be ignored.")

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_RETAIL_TEMPLATE
        draft = await generate_email_draft(
            claim, purchase, policy, mock_search, user_name="Jane Smith"
        )

    _assert_clean_draft(draft, claim, "pricematch@bestbuy.com")
    assert "Hello Best Buy Customer Care" in draft.draft_content
    assert "Thank you,\nJane Smith" in draft.draft_content
    assert "Dear Jane Smith" not in draft.draft_content
    assert "BBY-001" in draft.draft_content
    assert "Sony WH-1000XM5" in draft.draft_content
    assert draft.policy_clause_cited == clause
    assert "booking" not in draft.draft_content.lower()
    assert "stay" not in draft.draft_content.lower()
    assert "\n\n" in draft.draft_content
    mock_search.search_policies.assert_not_awaited()


@pytest.mark.asyncio
async def test_hilton_hotel_scenario() -> None:
    clause = (
        "Within 24 hours of booking, Hilton Honors members can claim a price match "
        "if a publicly available rate is lower."
    )
    purchase = _make_purchase(Platform.HILTON, order_id="HILTON-789012")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", clause, category="hotel")
    mock_search = AsyncMock()

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_HOTEL_TEMPLATE
        draft = await generate_email_draft(
            claim, purchase, policy, mock_search, user_name="Jane Smith"
        )

    _assert_clean_draft(draft, claim, policy.claim_email or "")
    assert "Hello Hilton Reservations" in draft.draft_content
    assert "booking" in draft.draft_content.lower()
    assert "HILTON-789012" in draft.draft_content
    assert draft.policy_clause_cited == clause


@pytest.mark.asyncio
async def test_clause_scoping_ignores_cross_platform_search() -> None:
    best_buy_clause = "Best Buy retail clause."
    hilton_search_clause = "Hilton Honors hotel clause from search."
    purchase = _make_purchase(
        Platform.BEST_BUY,
        category="retail",
        order_id="BBY-SCOPE",
        product_name="TV",
    )
    claim = _make_claim(purchase)
    policy = _make_policy(Platform.BEST_BUY, None, best_buy_clause, category="retail")
    mock_search = _mock_search_client(hilton_search_clause)

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_RETAIL_TEMPLATE
        draft = await generate_email_draft(claim, purchase, policy, mock_search)

    assert draft.policy_clause_cited == best_buy_clause
    assert hilton_search_clause not in draft.draft_content
    mock_search.search_policies.assert_not_awaited()


def test_normalize_draft_prose_splits_run_on_only() -> None:
    run_on = (
        "Hello Best Buy Customer Care. I am writing to request a price match refund on a recent purchase. "
        "Order BBY-001 covers a Sony WH-1000XM5 at $399.99. Thank you for your help with this request."
    )
    normalized = _normalize_draft_prose(run_on)
    assert "\n\n" in normalized
    assert "iPhone" not in normalized or "Sony" in normalized


def test_normalize_draft_prose_preserves_existing_breaks() -> None:
    text = "Hello Best Buy,\n\nOrder BBY-001.\n\nThank you,\nJane"
    assert _normalize_draft_prose(text) == text


@pytest.mark.asyncio
async def test_post_fill_placeholder_guard() -> None:
    purchase = _make_purchase(Platform.HILTON)
    claim = _make_claim(purchase)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", "Some clause.")
    mock_search = AsyncMock()
    bad_template = json.dumps(
        {
            "subject": "Price Match — {{ORDER_ID}}",
            "email_body": "Hello {{MERCHANT_NAME}}, this contains {{UNKNOWN}}.",
        }
    )

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = bad_template
        with pytest.raises(DraftGenerationError, match="unreplaced placeholder"):
            await generate_email_draft(claim, purchase, policy, mock_search)


@pytest.mark.asyncio
async def test_currency_formatting() -> None:
    purchase = _make_purchase(Platform.HILTON, order_id="HILTON-FMT-001")
    claim = _make_claim(purchase)
    policy = _make_policy(Platform.HILTON, "reservations@hilton.com", "Some clause.")
    mock_search = AsyncMock()

    with patch("src.draft.type_a_email._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_HOTEL_TEMPLATE
        draft = await generate_email_draft(claim, purchase, policy, mock_search)

    assert "$300.00" in draft.draft_content
    assert "$250.00" in draft.draft_content
    assert "$50.00" in draft.draft_content
