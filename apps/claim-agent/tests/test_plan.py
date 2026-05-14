"""Tests for src.plan — routing logic only, no real MongoDB connection."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from src.plan import (
    ClaimPlan,
    ClaimPlanError,
    ClaimType,
    InvalidPolicyError,
    PriceDroppedEvent,
    UnknownPlatformError,
    plan_claim,
)

_PURCHASE_DATE = datetime(2026, 1, 1, tzinfo=UTC)
_DETECTED_AT = datetime(2026, 1, 15, tzinfo=UTC)


def _make_event(**overrides: object) -> PriceDroppedEvent:
    return PriceDroppedEvent(
        **{
            "event_id": "evt-001",
            "purchase_id": "purch-001",
            "user_id": "user-001",
            "platform_id": "best_buy",
            "original_price": 100.0,
            "current_price": 80.0,
            "price_drop_amount": 20.0,
            "price_drop_pct": 20.0,
            "purchase_date": _PURCHASE_DATE,
            "detected_at": _DETECTED_AT,
            "currency": "USD",
            **overrides,
        }
    )


def _mock_client(claim_type: ClaimType | str | None, policy_id=None) -> AsyncMock:
    """Return a mock MongoDBClient whose get_policy returns a mock Policy."""
    client = AsyncMock()
    if claim_type is None:
        client.get_policy.return_value = None
    else:
        policy = MagicMock()
        policy.claim_type = claim_type
        policy.id = policy_id or uuid4()
        client.get_policy.return_value = policy
    return client


# ---------------------------------------------------------------------------
# Happy path x 4 (one per ClaimType)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_email() -> None:
    plan = await plan_claim(_make_event(), _mock_client(ClaimType.EMAIL))
    assert plan.claim_type == ClaimType.EMAIL
    assert plan.draft_generator == "type_a_email"
    assert plan.output_type == "email"
    assert plan.expected_response_format == "plain_text"


@pytest.mark.asyncio
async def test_happy_path_chat_script() -> None:
    plan = await plan_claim(
        _make_event(platform_id="hilton"), _mock_client(ClaimType.CHAT_SCRIPT)
    )
    assert plan.claim_type == ClaimType.CHAT_SCRIPT
    assert plan.draft_generator == "type_b_chat"
    assert plan.output_type == "chat_script"
    assert plan.expected_response_format == "markdown"


@pytest.mark.asyncio
async def test_happy_path_in_store() -> None:
    plan = await plan_claim(
        _make_event(platform_id="target"), _mock_client(ClaimType.IN_STORE)
    )
    assert plan.claim_type == ClaimType.IN_STORE
    assert plan.draft_generator == "type_c_in_store"
    assert plan.output_type == "in_store_guide"
    assert plan.expected_response_format == "markdown"


@pytest.mark.asyncio
async def test_happy_path_self_service() -> None:
    plan = await plan_claim(
        _make_event(platform_id="delta"), _mock_client(ClaimType.SELF_SERVICE)
    )
    assert plan.claim_type == ClaimType.SELF_SERVICE
    assert plan.draft_generator == "type_d_self_service"
    assert plan.output_type == "self_service_steps"
    assert plan.expected_response_format == "structured_json"


# ---------------------------------------------------------------------------
# Field pass-through
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_field_passthrough() -> None:
    policy_id = uuid4()
    event = _make_event(
        purchase_id="purch-xyz",
        user_id="user-abc",
        platform_id="best_buy",
        price_drop_amount=25.0,
        price_drop_pct=12.5,
        original_price=200.0,
        current_price=175.0,
        currency="USD",
    )
    plan = await plan_claim(event, _mock_client(ClaimType.EMAIL, policy_id=policy_id))

    assert plan.purchase_id == "purch-xyz"
    assert plan.user_id == "user-abc"
    assert plan.platform_id == "best_buy"
    assert plan.price_drop_amount == 25.0
    assert plan.price_drop_pct == 12.5
    assert plan.original_price == 200.0
    assert plan.current_price == 175.0
    assert plan.currency == "USD"
    assert plan.policy_id == str(policy_id)
    assert isinstance(plan, ClaimPlan)


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_platform_error() -> None:
    with pytest.raises(UnknownPlatformError) as exc_info:
        await plan_claim(_make_event(platform_id="zappos"), _mock_client(None))
    assert exc_info.value.platform_id == "zappos"
    assert issubclass(UnknownPlatformError, ClaimPlanError)


@pytest.mark.asyncio
async def test_invalid_policy_error() -> None:
    with pytest.raises(InvalidPolicyError) as exc_info:
        await plan_claim(_make_event(platform_id="best_buy"), _mock_client("fax_machine"))
    assert exc_info.value.platform_id == "best_buy"
    assert exc_info.value.raw_value == "fax_machine"
    assert issubclass(InvalidPolicyError, ClaimPlanError)


@pytest.mark.asyncio
async def test_inactive_policy_not_rechecked() -> None:
    # get_policy (task 2.6) filters active: True at the MongoDB query layer.
    # plan_claim trusts this — an inactive platform looks identical to an unknown one.
    with pytest.raises(UnknownPlatformError):
        await plan_claim(_make_event(platform_id="inactive_platform"), _mock_client(None))
