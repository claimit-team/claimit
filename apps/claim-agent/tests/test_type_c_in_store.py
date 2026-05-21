"""Tests for Type C (in-store guide) draft generator — Walmart in-store scenario."""

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
from claimit_mongodb_models.user import DefaultLocation
from maps.google_maps import StoreInfo
from src.draft.models import ClaimDraft
from src.draft.type_c_in_store import generate_in_store_guide

_NOW = datetime(2026, 3, 15, tzinfo=UTC)
_PURCHASE_DATE = datetime(2026, 1, 10, tzinfo=UTC)
_WINDOW_EXPIRES = datetime(2026, 1, 25, tzinfo=UTC)

_MOCK_IN_STORE_OUTPUT = json.dumps(
    {
        "opening_statement": (
            "Hello, I'm {{USER_NAME}} and I'd like to request a price match on {{PRODUCT_NAME}}."
        ),
        "what_to_bring": [
            "Proof of purchase (Order #{{ORDER_ID}})",
            "Evidence of the current lower price: {{CURRENT_PRICE}}",
        ],
        "talking_points": [
            "I originally paid {{ORIGINAL_PRICE}} but the price is now {{CURRENT_PRICE}}.",
            "I am requesting a refund of {{REFUND_AMOUNT}}.",
            "Your store policy states: {{POLICY_CITATION}}",
            "The nearest store is at {{STORE_ADDRESS}} — call {{STORE_PHONE}} to confirm.",
            "More information is available at {{CLAIM_URL}}",
        ],
        "policy_citation": (
            "Walmart Price Match Guarantee: We will match any competitor's price "
            "on an identical, in-stock item within 30 days of purchase."
        ),
        "fallback_note": (
            "Please ask for a manager and reference the policy at {{CLAIM_URL}}. "
            "Store hours: {{STORE_HOURS}}."
        ),
    }
)


# ─── Builders ────────────────────────────────────────────────────────────────


def _make_purchase(
    platform: Platform = Platform.WALMART,
    price_paid: float = 249.99,
    order_id: str = "HD-2024-001",
) -> Purchase:
    return Purchase(
        _id=uuid4(),
        user_id=uuid4(),
        platform=platform,
        category="retail",
        product_name="Ryobi 18V Drill Kit",
        product_id="ryobi-18v-drill",
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
        claim_type=ClaimType.IN_STORE,
        monitoring_cadence_minutes=360,
        ingested_at=_NOW,
        ingestion_source=IngestionSource.GMAIL,
        receipt_storage_url=None,
        receipt_hash=None,
        extraction_confidence=ExtractionConfidence(platform=0.95, price=0.95, overall_min=0.90),
    )


def _make_claim(purchase: Purchase, claim_amount: float = 30.0) -> Claim:
    placeholder = "Draft pending."
    return Claim(
        _id=uuid4(),
        purchase_id=purchase.id,
        user_id=purchase.user_id,
        platform=purchase.platform,
        claim_amount=claim_amount,
        currency="USD",
        claim_type=ClaimType.IN_STORE,
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
        trace_id="evt-test-type-c-001",
    )


def _make_policy(
    platform: Platform = Platform.WALMART,
    clause: str = "Walmart matches any lower price within 30 days.",
) -> Policy:
    return Policy(
        _id=uuid4(),
        platform=platform,
        category="retail",
        window_days=30,
        window_days_member=None,
        pre_arrival_hours_required=None,
        covers_own_drops=True,
        covers_competitor_drops=True,
        claim_type=ClaimType.IN_STORE,
        claim_url="https://www.walmart.com/help/article/walmart-price-match-policy/5aadf443d00f4a83afe66760ca0b11e3",
        claim_email=None,
        claim_phone=None,
        loyalty_required=False,
        award_ticket_eligible=None,
        bundle_exclusions=False,
        key_exclusions=[],
        policy_url="https://www.walmart.com/help/article/walmart-price-match-policy/5aadf443d00f4a83afe66760ca0b11e3",
        policy_text_full="Full policy text placeholder.",
        policy_text_relevant_clause=clause,
        last_verified=_NOW,
        active=True,
    )


def _mock_search_client(clause: str) -> AsyncMock:
    mock = AsyncMock()
    mock.search_policies.return_value = [{"policy_text_relevant_clause": clause}]
    return mock


def _make_location(lat: float = 33.77, lon: float = -84.39) -> DefaultLocation:
    return DefaultLocation(city="Atlanta", state="GA", lat=lat, lon=lon)


# ─── Shared assertions ────────────────────────────────────────────────────────


def _assert_clean_draft(draft: ClaimDraft, claim: Claim) -> None:
    assert "{{" not in draft.draft_content, "Unreplaced placeholder in draft_content"
    assert draft.claim_type == "in_store"
    assert draft.to_address == ""
    assert draft.subject == ""
    assert draft.refund_amount == claim.claim_amount
    assert draft.policy_clause_cited


# ─── Tests ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_in_store_guide_with_location() -> None:
    """Store info is fetched and injected when a valid user_location is provided."""
    purchase = _make_purchase()
    claim = _make_claim(purchase)
    policy = _make_policy()
    mock_search = _mock_search_client("Walmart matches any lower price within 30 days.")
    location = _make_location()
    store = StoreInfo(
        address="123 Main St, Atlanta, GA 30301",
        hours=["Monday: 6:00 AM - 10:00 PM"],
        phone="555-1234",
    )

    with (
        patch("src.draft.type_c_in_store._run_draft_agent", new_callable=AsyncMock) as mock_runner,
        patch(
            "src.draft.type_c_in_store.find_nearest_store", new_callable=AsyncMock
        ) as mock_places,
    ):
        mock_runner.return_value = _MOCK_IN_STORE_OUTPUT
        mock_places.return_value = store

        draft = await generate_in_store_guide(
            claim,
            purchase,
            policy,
            mock_search,
            user_name="Jane Smith",
            current_price=219.99,
            user_location=location,
        )

    _assert_clean_draft(draft, claim)
    assert draft.claim_type == "in_store"
    assert "123 Main St" in draft.draft_content
    assert "{{" not in draft.draft_content
    mock_places.assert_awaited_once_with(location.lat, location.lon, str(purchase.platform))


@pytest.mark.asyncio
async def test_generate_in_store_guide_no_location_fallback() -> None:
    """Draft is generated without calling find_nearest_store when user_location is None."""
    purchase = _make_purchase()
    claim = _make_claim(purchase)
    policy = _make_policy()
    mock_search = _mock_search_client("Walmart matches any lower price within 30 days.")

    with (
        patch("src.draft.type_c_in_store._run_draft_agent", new_callable=AsyncMock) as mock_runner,
        patch(
            "src.draft.type_c_in_store.find_nearest_store", new_callable=AsyncMock
        ) as mock_places,
    ):
        mock_runner.return_value = _MOCK_IN_STORE_OUTPUT
        mock_places.return_value = None

        draft = await generate_in_store_guide(
            claim,
            purchase,
            policy,
            mock_search,
            user_name="John Doe",
            current_price=219.99,
            user_location=None,
        )

    _assert_clean_draft(draft, claim)
    assert draft.claim_type == "in_store"
    assert "{{" not in draft.draft_content
    assert str(policy.claim_url) in draft.draft_content
    mock_places.assert_not_awaited()


@pytest.mark.asyncio
async def test_generate_in_store_guide_places_api_failure_fallback() -> None:
    """Draft is still generated when find_nearest_store returns None (API failure)."""
    purchase = _make_purchase()
    claim = _make_claim(purchase)
    policy = _make_policy()
    mock_search = _mock_search_client("Walmart matches any lower price within 30 days.")
    location = _make_location()

    with (
        patch("src.draft.type_c_in_store._run_draft_agent", new_callable=AsyncMock) as mock_runner,
        patch(
            "src.draft.type_c_in_store.find_nearest_store", new_callable=AsyncMock
        ) as mock_places,
    ):
        mock_runner.return_value = _MOCK_IN_STORE_OUTPUT
        mock_places.return_value = None  # simulates Places API failure

        draft = await generate_in_store_guide(
            claim,
            purchase,
            policy,
            mock_search,
            user_name="Alice Johnson",
            current_price=219.99,
            user_location=location,
        )

    _assert_clean_draft(draft, claim)
    assert draft.claim_type == "in_store"
    assert "{{" not in draft.draft_content
    assert str(policy.claim_url) in draft.draft_content
    mock_places.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_in_store_guide_zero_coordinates_skips_places() -> None:
    """find_nearest_store is skipped when user_location has lat=0 and lon=0."""
    purchase = _make_purchase()
    claim = _make_claim(purchase)
    policy = _make_policy()
    mock_search = _mock_search_client("Walmart matches any lower price within 30 days.")
    zero_location = DefaultLocation(city="Unknown", state="XX", lat=0, lon=0)

    with (
        patch("src.draft.type_c_in_store._run_draft_agent", new_callable=AsyncMock) as mock_runner,
        patch(
            "src.draft.type_c_in_store.find_nearest_store", new_callable=AsyncMock
        ) as mock_places,
    ):
        mock_runner.return_value = _MOCK_IN_STORE_OUTPUT

        draft = await generate_in_store_guide(
            claim,
            purchase,
            policy,
            mock_search,
            user_name="Test User",
            current_price=219.99,
            user_location=zero_location,
        )

    _assert_clean_draft(draft, claim)
    assert "{{" not in draft.draft_content
    mock_places.assert_not_awaited()


@pytest.mark.asyncio
async def test_generate_in_store_guide_valid_zero_lon() -> None:
    """find_nearest_store IS called when lat is non-zero but lon=0 (e.g. London area)."""
    purchase = _make_purchase()
    claim = _make_claim(purchase)
    policy = _make_policy()
    mock_search = _mock_search_client("Walmart matches any lower price within 30 days.")
    london_location = DefaultLocation(city="London", state="ENG", lat=51.5, lon=0)
    store = StoreInfo(address="1 Oxford St, London", hours=[], phone="")

    with (
        patch("src.draft.type_c_in_store._run_draft_agent", new_callable=AsyncMock) as mock_runner,
        patch(
            "src.draft.type_c_in_store.find_nearest_store", new_callable=AsyncMock
        ) as mock_places,
    ):
        mock_runner.return_value = _MOCK_IN_STORE_OUTPUT
        mock_places.return_value = store

        draft = await generate_in_store_guide(
            claim,
            purchase,
            policy,
            mock_search,
            user_name="Test User",
            current_price=219.99,
            user_location=london_location,
        )

    _assert_clean_draft(draft, claim)
    assert "{{" not in draft.draft_content
    mock_places.assert_awaited_once_with(
        london_location.lat, london_location.lon, str(purchase.platform)
    )
