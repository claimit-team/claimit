"""Integration tests for ADK session-state placeholder seeding in draft generation."""

from __future__ import annotations

import json
import re
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
from claimit_mongodb_models.enums import Category
from src.draft import type_a_email, type_b_chat, type_c_in_store
from src.draft._shared import DRAFT_INSTRUCTION_PLACEHOLDER_STATE, _run_draft_agent
from src.draft.type_a_email import generate_email_draft

_PLACEHOLDER_RE = re.compile(r"\{\{([A-Z_]+)\}\}")

_NOW = datetime(2026, 3, 15, tzinfo=UTC)
_CHECK_IN = datetime(2026, 4, 10, tzinfo=UTC)
_WINDOW_EXPIRES = datetime(2026, 4, 25, tzinfo=UTC)

_MOCK_TEMPLATE = json.dumps(
    {
        "subject": "Price Match Refund Request — Order {{ORDER_ID}}",
        "email_body": (
            "Hello {{MERCHANT_NAME}} Customer Care,\n\n"
            "I'm writing to request a price match refund on a recent purchase.\n\n"
            "Order {{ORDER_ID}} — {{PRODUCT_NAME}} at {{ORIGINAL_PRICE}}. The current price is "
            "{{CURRENT_PRICE}}, a difference of {{REFUND_AMOUNT}}.\n\n"
            "Pursuant to your policy: {{POLICY_CITATION}}\n\n"
            "Thank you,\n{{USER_NAME}}"
        ),
    }
)


class _FakeFinalEvent:
    class _Part:
        def __init__(self, text: str) -> None:
            self.text = text

    class _Content:
        def __init__(self, text: str) -> None:
            self.parts = [_FakeFinalEvent._Part(text)]

    def __init__(self, text: str) -> None:
        self.content = _FakeFinalEvent._Content(text)

    def is_final_response(self) -> bool:
        return True


class _FakeRunner:
    def __init__(self, **_kwargs: object) -> None:
        pass

    async def run_async(self, **_kwargs: object):
        yield _FakeFinalEvent(_MOCK_TEMPLATE)


def _instruction_prompts() -> list[str]:
    return [
        type_a_email.retail_email_prompt(),
        type_a_email.hotel_email_prompt(),
        type_a_email.airline_email_prompt(),
        type_b_chat.CHAT_SCRIPT_SYSTEM_PROMPT,
        type_c_in_store.IN_STORE_GUIDE_SYSTEM_PROMPT,
    ]


def _make_purchase(
    platform: Platform,
    price_paid: float = 399.99,
    order_id: str = "BBY-001",
) -> Purchase:
    return Purchase(
        _id=uuid4(),
        user_id=uuid4(),
        platform=platform,
        category="retail",
        product_name="4K TV",
        product_id="tv-4k",
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
        purchase_date=_CHECK_IN,
        purchase_date_basis=PurchaseDateBasis.ORDER_DATE,
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


def _make_policy(platform: Platform, clause: str) -> Policy:
    return Policy(
        _id=uuid4(),
        platform=platform,
        category="retail",
        window_days=15,
        window_days_member=30,
        pre_arrival_hours_required=None,
        covers_own_drops=True,
        covers_competitor_drops=False,
        claim_type=ClaimType.EMAIL,
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


def test_draft_instruction_placeholder_registry_covers_all_prompt_tokens() -> None:
    """Every {{TOKEN}} in type_a/b/c instructions must exist in the ADK state registry."""
    discovered: set[str] = set()
    for prompt in _instruction_prompts():
        discovered.update(_PLACEHOLDER_RE.findall(prompt))

    missing = discovered - set(DRAFT_INSTRUCTION_PLACEHOLDER_STATE)
    assert not missing, f"Missing from DRAFT_INSTRUCTION_PLACEHOLDER_STATE: {sorted(missing)}"


@pytest.mark.asyncio
async def test_run_draft_agent_seeds_session_state_without_key_error() -> None:
    """Real _run_draft_agent + ADK session setup; only Runner.run_async is mocked."""
    create_session_mock = AsyncMock(return_value=None)
    with (
        patch(
            "src.draft._shared.InMemorySessionService.create_session",
            create_session_mock,
        ),
        patch("src.draft._shared.Runner", _FakeRunner),
    ):
        result = await _run_draft_agent(
            "best_buy",
            "Price match within 15 days.",
            lambda: type_a_email._build_draft_agent(Category.RETAIL),
            category="retail",
        )

    assert result == _MOCK_TEMPLATE
    assert create_session_mock.await_args.kwargs["state"] == DRAFT_INSTRUCTION_PLACEHOLDER_STATE


@pytest.mark.asyncio
async def test_generate_email_draft_best_buy_with_real_adk_session_path() -> None:
    """End-to-end type_a path: search mocked, Runner mocked at boundary only."""
    clause = "Best Buy price match within 15 days."
    purchase = _make_purchase(Platform.BEST_BUY, price_paid=399.99, order_id="BBY-001")
    claim = _make_claim(purchase, claim_amount=50.0)
    policy = _make_policy(Platform.BEST_BUY, clause)

    empty_search = AsyncMock()
    empty_search.search_policies.return_value = []

    create_session_mock = AsyncMock(return_value=None)
    with (
        patch(
            "src.draft._shared.InMemorySessionService.create_session",
            create_session_mock,
        ),
        patch("src.draft._shared.Runner", _FakeRunner),
    ):
        draft = await generate_email_draft(claim, purchase, policy, empty_search)

    assert create_session_mock.await_args.kwargs["state"] == DRAFT_INSTRUCTION_PLACEHOLDER_STATE

    assert "{{" not in draft.draft_content
    assert "{{" not in draft.subject
    assert "BBY-001" in draft.draft_content
    assert "BBY-001" in draft.subject
    assert "$399.99" in draft.draft_content
    assert "$349.99" in draft.draft_content
    assert "$50.00" in draft.draft_content
    assert draft.to_address == "pricematch@bestbuy.com"
    assert draft.policy_clause_cited == clause
