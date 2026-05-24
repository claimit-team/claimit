"""Tests for Type B (chat script) draft generator — Best Buy, Target, and retail-alt scenarios."""

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
from src.draft._shared import DraftGenerationError
from src.draft.models import ClaimDraft
from src.draft.type_b_chat import generate_chat_script

_NOW = datetime(2026, 3, 15, tzinfo=UTC)
_PURCHASE_DATE = datetime(2026, 1, 10, tzinfo=UTC)
_WINDOW_EXPIRES = datetime(2026, 1, 25, tzinfo=UTC)

_MOCK_TEMPLATE = json.dumps(
    {
        "title": "Best Buy Price Match Script — Order {{ORDER_ID}}",
        "main_steps": [
            "Hi, I'm {{USER_NAME}} and I'd like to request a price match refund.",
            "I purchased an item on {{CHECK_IN_DATE}} (order {{ORDER_ID}}), "
            "valid through {{CHECKOUT_DATE}}.",
            "I originally paid {{ORIGINAL_PRICE}}, current price is {{CURRENT_PRICE}}. "
            "I'm requesting a refund of {{REFUND_AMOUNT}}.",
            "According to your policy: {{POLICY_CITATION}}",
            "My order reference is {{ORDER_ID}} and I can provide proof if needed.",
        ],
        "escalation_steps": [
            "I'd like to escalate this — could you transfer me to a supervisor "
            "or provide a case number?",
            "Could you tell me the formal submission channel? "
            "I'll need a reference number for my records.",
        ],
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
        category="retail",
        product_name="Samsung 65-inch QLED TV",
        product_id="sam-qled-65",
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
        claim_type=ClaimType.CHAT_SCRIPT,
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
        claim_type=ClaimType.CHAT_SCRIPT,
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
    clause: str,
) -> Policy:
    return Policy(
        _id=uuid4(),
        platform=platform,
        category="retail",
        window_days=15,
        window_days_member=30,
        pre_arrival_hours_required=24,
        covers_own_drops=True,
        covers_competitor_drops=False,
        claim_type=ClaimType.CHAT_SCRIPT,
        claim_url=None,
        claim_email=None,
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


def _assert_clean_draft(draft: ClaimDraft, claim: Claim) -> None:
    assert "{{" not in draft.draft_content, "Unreplaced placeholder in draft_content"
    assert "{{" not in draft.subject, "Unreplaced placeholder in subject"
    assert draft.claim_type == "chat_script"
    assert draft.to_address == ""
    assert draft.refund_amount == claim.claim_amount
    assert draft.policy_clause_cited
    assert "Step 1:" in draft.draft_content
    assert "Step 5:" in draft.draft_content
    assert "--- IF AGENT DECLINES ---" in draft.draft_content
    assert "Step 6:" in draft.draft_content


# ─── Scenarios ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_best_buy_scenario() -> None:
    search_clause = (
        "Best Buy Price Match Guarantee: If you find a lower price on an identical "
        "available product at a local retail competitor or qualifying online retailer, "
        "we will match that price."
    )
    fallback_clause = "Best Buy Fallback: Standard return policy applies."
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=329.99, order_id="BB-2024-789123")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.BEST_BUY, fallback_clause)
    mock_search = _mock_search_client(search_clause)

    with patch("src.draft.type_b_chat._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_chat_script(
            claim, purchase, policy, mock_search, user_name="Jane Smith"
        )

    _assert_clean_draft(draft, claim)
    assert "BB-2024-789123" in draft.draft_content
    assert "BB-2024-789123" in draft.subject
    assert draft.platform == "best_buy"
    assert draft.policy_clause_cited == fallback_clause
    mock_search.search_policies.assert_not_awaited()


@pytest.mark.asyncio
async def test_target_scenario() -> None:
    search_clause = (
        "Target Price Match Policy: We will match the price if you find a current lower "
        "price at Target.com or select online competitors within 14 days of purchase."
    )
    fallback_clause = "Target Fallback: General refund policy applies."
    purchase = _make_purchase(Platform.TARGET, price_paid=199.99, order_id="TGT-2024-456789")
    claim = _make_claim(purchase, claim_amount=30.0)
    policy = _make_policy(Platform.TARGET, fallback_clause)
    mock_search = _mock_search_client(search_clause)

    with patch("src.draft.type_b_chat._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_chat_script(
            claim, purchase, policy, mock_search, user_name="Robert Chen"
        )

    _assert_clean_draft(draft, claim)
    assert "TGT-2024-456789" in draft.draft_content
    assert draft.platform == "target"
    assert draft.refund_amount == 30.0
    assert draft.policy_clause_cited == fallback_clause
    mock_search.search_policies.assert_not_awaited()


@pytest.mark.asyncio
async def test_best_buy_high_value_scenario() -> None:
    search_clause = (
        "Best Rate Guarantee: Applies to identical models when a verifiably lower "
        "publicly available price is found within the eligible claim window."
    )
    fallback_clause = "Best Buy High-Value Fallback: Items over $500 subject to manager review."
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=1299.99, order_id="BB-2024-HIGH-001")
    claim = _make_claim(purchase, claim_amount=200.0)
    policy = _make_policy(Platform.BEST_BUY, fallback_clause)
    mock_search = _mock_search_client(search_clause)

    with patch("src.draft.type_b_chat._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_chat_script(
            claim, purchase, policy, mock_search, user_name="Alice Johnson"
        )

    _assert_clean_draft(draft, claim)
    assert draft.refund_amount == 200.0
    assert "BB-2024-HIGH-001" in draft.draft_content
    assert draft.policy_clause_cited == fallback_clause
    mock_search.search_policies.assert_not_awaited()


@pytest.mark.asyncio
async def test_clause_scoping_ignores_cross_platform_search() -> None:
    loaded_clause = "Best Buy loaded policy clause."
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=200.0, order_id="BB-SCOPE-001")
    claim = _make_claim(purchase, claim_amount=30.0)
    policy = _make_policy(Platform.BEST_BUY, loaded_clause)
    mock_search = _mock_search_client("Target competitor clause from search.")

    with patch("src.draft.type_b_chat._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_chat_script(claim, purchase, policy, mock_search)

    assert draft.policy_clause_cited == loaded_clause
    mock_search.search_policies.assert_not_awaited()


@pytest.mark.asyncio
async def test_empty_search_results_uses_policy_fallback() -> None:
    """When search_policies returns no results, policy.policy_text_relevant_clause is used."""
    fallback_clause = "Fallback guarantee: We match any lower price found for the same product."
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=200.0, order_id="BB-FALLBACK-001")
    claim = _make_claim(purchase, claim_amount=30.0)
    policy = _make_policy(Platform.BEST_BUY, fallback_clause)

    empty_search = AsyncMock()
    empty_search.search_policies.return_value = []

    with patch("src.draft.type_b_chat._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = _MOCK_TEMPLATE
        draft = await generate_chat_script(
            claim, purchase, policy, empty_search, user_name="Test User"
        )

    assert "{{" not in draft.draft_content
    assert "{{" not in draft.subject
    assert draft.policy_clause_cited == fallback_clause
    assert draft.refund_amount == 30.0


@pytest.mark.asyncio
async def test_wrong_main_step_count_raises() -> None:
    """Parser should raise if Gemini returns wrong number of main steps."""
    bad_template = json.dumps(
        {
            "title": "Script — Order {{ORDER_ID}}",
            "main_steps": [
                "Step 1 text.",
                "Step 2 text.",
                # only 2 steps — below minimum of 3
            ],
            "escalation_steps": [
                "Escalation step 1.",
                "Escalation step 2.",
            ],
        }
    )
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=100.0, order_id="BB-ERR-001")
    claim = _make_claim(purchase, claim_amount=10.0)
    policy = _make_policy(Platform.BEST_BUY, "Some clause.")
    mock_search = _mock_search_client("Some clause.")

    with patch("src.draft.type_b_chat._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = bad_template
        with pytest.raises(DraftGenerationError, match="Expected 3-8 main steps, got 2"):
            await generate_chat_script(claim, purchase, policy, mock_search)


@pytest.mark.asyncio
async def test_wrong_escalation_step_count_raises() -> None:
    """Parser should raise if Gemini returns wrong number of escalation steps."""
    bad_template = json.dumps(
        {
            "title": "Script — Order {{ORDER_ID}}",
            "main_steps": [
                "Step 1 text.",
                "Step 2 text.",
                "Step 3 text.",
                "Step 4 text.",
                "Step 5 text.",
            ],
            "escalation_steps": [
                "Escalation step 1.",
                "Escalation step 2.",
                "Escalation step 3.",
                "Escalation step 4.",
                "Escalation step 5.",
                "Escalation step 6.",
                # 6 steps — above maximum of 5
            ],
        }
    )
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=100.0, order_id="BB-ERR-002")
    claim = _make_claim(purchase, claim_amount=10.0)
    policy = _make_policy(Platform.BEST_BUY, "Some clause.")
    mock_search = _mock_search_client("Some clause.")

    with patch("src.draft.type_b_chat._run_draft_agent", new_callable=AsyncMock) as mock_runner:
        mock_runner.return_value = bad_template
        with pytest.raises(DraftGenerationError, match="Expected 1-5 escalation steps, got 6"):
            await generate_chat_script(claim, purchase, policy, mock_search)
