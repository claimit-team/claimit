"""Tests for Type D (self-service walkthrough) draft generator."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from types import SimpleNamespace
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
from src.draft.type_d_self_service import generate_self_service_walkthrough

_NOW = datetime(2026, 3, 15, tzinfo=UTC)
_PURCHASE_DATE = datetime(2026, 1, 10, tzinfo=UTC)
_WINDOW_EXPIRES = datetime(2026, 3, 25, tzinfo=UTC)

_MOCK_NOTES = json.dumps(["No change fee on eligible fares", "Basic fares excluded"])


# ─── Builders ────────────────────────────────────────────────────────────────


def _make_purchase(
    platform: str = "southwest",
    price_paid: float = 299.0,
    order_id: str = "SW-ABC123",
    product_name: str | None = None,
):
    """Returns a real Purchase for enum platforms, or a SimpleNamespace for others."""
    _product_names: dict[str, str] = {
        "southwest": "Southwest Flight ORD→LAX",
        "united": "United Flight ORD→LAX",
        "delta": "Delta Flight ATL→LAX",
        "american": "American Flight DFW→LAX",
        "alaska": "Alaska Airlines Flight SEA→LAX",
        "costco": "Costco Refrigerator",
        "dell": "Dell XPS 15",
        "jetblue": "JetBlue Flight JFK→LAX",
    }
    pname = product_name or _product_names.get(platform, "Test Product")

    try:
        plat_enum = Platform(platform)
    except ValueError:
        # Platform not in enum — return a duck-typed stub
        stub = SimpleNamespace()
        stub.platform = platform  # plain string; no .value on SimpleNamespace
        stub.order_id = order_id
        stub.product_name = pname
        stub.price_paid = price_paid
        stub.currency = "USD"
        stub.id = uuid4()
        stub.user_id = uuid4()
        return stub

    return Purchase(
        _id=uuid4(),
        user_id=uuid4(),
        platform=plat_enum,
        category="airline",
        product_name=pname,
        product_id=f"{platform}-product-001",
        product_url=None,
        variant=None,
        fare_class=None,
        room_type=None,
        bed_type=None,
        rate_type=None,
        price_paid=price_paid,
        member_price_at_purchase=None,
        non_member_price_at_purchase=None,
        currency="USD",
        purchase_date=_PURCHASE_DATE,
        purchase_date_basis=PurchaseDateBasis.ORDER_DATE,
        window_expires=_WINDOW_EXPIRES,
        order_id=order_id,
        member_tier_at_purchase=None,
        status=PurchaseStatus.MONITORING,
        claim_type=ClaimType.SELF_SERVICE,
        monitoring_cadence_minutes=360,
        ingested_at=_NOW,
        ingestion_source=IngestionSource.GMAIL,
        receipt_storage_url=None,
        receipt_hash=None,
        extraction_confidence=ExtractionConfidence(platform=0.95, price=0.95, overall_min=0.90),
    )


def _make_claim(purchase, claim_amount: float = 50.0) -> Claim:
    placeholder = "Draft pending."
    # Use a valid Platform enum for Claim construction — the generator doesn't use claim.platform
    if isinstance(getattr(purchase, "platform", None), Platform):
        plat = purchase.platform
    else:
        try:
            plat = Platform(str(getattr(purchase, "platform", "southwest")))
        except ValueError:
            plat = Platform.SOUTHWEST

    purchase_id = getattr(purchase, "id", uuid4())
    user_id = getattr(purchase, "user_id", uuid4())

    return Claim(
        _id=uuid4(),
        purchase_id=purchase_id,
        user_id=user_id,
        platform=plat,
        claim_amount=claim_amount,
        currency="USD",
        claim_type=ClaimType.SELF_SERVICE,
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


def _make_policy(platform: str = "southwest") -> Policy:
    _claim_urls: dict[str, str] = {
        "southwest": "https://support.southwest.com/helpcenter/s/article/changing-cancelling-flights",
        "united": "https://www.united.com/en/us/fly/customer-commitment.html",
        "delta": "https://www.delta.com/us/en/booking-information/online-booking/low-fare-commitment",
        "american": "https://www.aa.com/web/i18n/customer-service/faqs/reservations-tickets-faqs.html",
        "alaska": "https://www.alaskaair.com/content/about-us/customer-commitment/customer-commitment-lowest-fare",
        "costco": "https://customerservice.costco.com/app/answers/detail/a_id/628",
        "dell": "https://www.dell.com/en-us/lp/price-match-guarantee",
    }
    _clauses: dict[str, str] = {
        "southwest": "Southwest price drop protection: rebook the same flight at the lower fare within the travel window.",
        "delta": "Delta fare adjustment: cancel and rebook to receive the lower fare as a refund to original payment.",
        "alaska": "Alaska Best Value Guarantee: submit a claim form within 24 hours for a voucher equal to the fare difference.",
        "costco": "Costco Price Adjustment Policy: request within 30 days of purchase for a credit to your member account.",
        "dell": "Dell Price Match: submit within 30 days; approved adjustments refunded to original payment method.",
    }
    _exclusions: dict[str, list[str]] = {
        "southwest": ["Sale fares not eligible", "Points bookings excluded"],
        "delta": [
            "Basic Economy excluded",
            "Group bookings not eligible",
            "Award tickets excluded",
        ],
        "alaska": [
            "Award tickets excluded",
            "Group fares excluded",
            "Must be same fare class",
        ],
        "costco": ["Clearance items excluded", "Electronics over 90 days excluded"],
        "dell": ["Marketplace sellers excluded", "Open-box items not eligible"],
    }

    # Use a valid Platform enum for Policy; fall back to SOUTHWEST for non-enum platforms
    try:
        plat_enum = Platform(platform)
    except ValueError:
        plat_enum = Platform.SOUTHWEST

    return Policy(
        _id=uuid4(),
        platform=plat_enum,
        category="airline",
        window_days=30,
        window_days_member=None,
        pre_arrival_hours_required=None,
        covers_own_drops=True,
        covers_competitor_drops=False,
        claim_type=ClaimType.SELF_SERVICE,
        claim_url=_claim_urls.get(platform),
        claim_email=None,
        claim_phone=None,
        loyalty_required=False,
        award_ticket_eligible=None,
        bundle_exclusions=False,
        key_exclusions=_exclusions.get(platform, ["Exclusion A", "Exclusion B"]),
        policy_url="https://example.com/policy",
        policy_text_full="Full policy text placeholder.",
        policy_text_relevant_clause=_clauses.get(
            platform, "Price adjustment available within the eligible window."
        ),
        last_verified=_NOW,
        active=True,
    )


def _mock_search_client() -> AsyncMock:
    mock = AsyncMock()
    mock.search_policies.return_value = []
    return mock


# ─── Tests ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_southwest_happy_path() -> None:
    purchase = _make_purchase("southwest", price_paid=299.0, order_id="SW-CONF-001")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy("southwest")
    search_client = _mock_search_client()

    with patch(
        "src.draft.type_d_self_service._run_draft_agent", new_callable=AsyncMock
    ) as mock_runner:
        mock_runner.return_value = _MOCK_NOTES
        draft = await generate_self_service_walkthrough(
            claim, purchase, policy, search_client, user_name="Jane Smith"
        )

    assert draft.claim_type == "self_service"

    walkthrough = json.loads(draft.draft_content)
    assert len(walkthrough["steps"]) >= 5
    assert any("SW-CONF-001" in step for step in walkthrough["steps"])
    assert any("full name as it appears on your booking" in step for step in walkthrough["steps"])
    assert "50.00" in walkthrough["order_summary"]
    assert walkthrough["estimated_minutes"] > 0


@pytest.mark.asyncio
async def test_delta_cancel_rebook_warning() -> None:
    purchase = _make_purchase("delta", price_paid=350.0, order_id="DL-CONF-002")
    claim = _make_claim(purchase, claim_amount=80.0)
    policy = _make_policy("delta")
    search_client = _mock_search_client()

    with patch(
        "src.draft.type_d_self_service._run_draft_agent", new_callable=AsyncMock
    ) as mock_runner:
        mock_runner.return_value = _MOCK_NOTES
        draft = await generate_self_service_walkthrough(
            claim, purchase, policy, search_client, user_name="Bob Delta"
        )

    walkthrough = json.loads(draft.draft_content)
    assert any("WARNING" in step for step in walkthrough["steps"])


@pytest.mark.asyncio
async def test_alaska_form_submit() -> None:
    purchase = _make_purchase("alaska", price_paid=420.0, order_id="AS-CONF-003")
    claim = _make_claim(purchase, claim_amount=60.0)
    policy = _make_policy("alaska")
    search_client = _mock_search_client()

    with patch(
        "src.draft.type_d_self_service._run_draft_agent", new_callable=AsyncMock
    ) as mock_runner:
        mock_runner.return_value = _MOCK_NOTES
        draft = await generate_self_service_walkthrough(
            claim, purchase, policy, search_client, user_name="Alice Alaska"
        )

    walkthrough = json.loads(draft.draft_content)
    assert len(walkthrough["steps"]) >= 1
    claim_url = policy.claim_url or ""
    assert any(claim_url in step for step in walkthrough["steps"])


@pytest.mark.asyncio
async def test_costco_retail_flow() -> None:
    purchase = _make_purchase("costco", price_paid=1299.0, order_id="CST-ORD-004")
    claim = _make_claim(purchase, claim_amount=200.0)
    policy = _make_policy("costco")
    search_client = _mock_search_client()

    with patch(
        "src.draft.type_d_self_service._run_draft_agent", new_callable=AsyncMock
    ) as mock_runner:
        mock_runner.return_value = _MOCK_NOTES
        draft = await generate_self_service_walkthrough(
            claim, purchase, policy, search_client, user_name="Carol Costco"
        )

    walkthrough = json.loads(draft.draft_content)
    assert walkthrough["sub_pattern"] == "portal_request"


@pytest.mark.asyncio
async def test_unsupported_platform_raises() -> None:
    purchase = _make_purchase("jetblue", price_paid=180.0, order_id="JB-CONF-005")
    claim = _make_claim(purchase, claim_amount=30.0)
    policy = _make_policy("jetblue")
    search_client = _mock_search_client()

    with (
        patch("src.draft.type_d_self_service._run_draft_agent", new_callable=AsyncMock),
        pytest.raises(ValueError, match="Unsupported platform for Type D"),
    ):
        await generate_self_service_walkthrough(claim, purchase, policy, search_client)
