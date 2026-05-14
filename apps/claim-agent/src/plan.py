"""Claim routing logic — maps a price.dropped event to a typed ClaimPlan."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from claimit_mongodb_models import ClaimType, MongoDBClient

_log = logging.getLogger(__name__)


class PriceDroppedEvent(BaseModel):
    event_id: str
    purchase_id: str
    user_id: str
    platform_id: str
    original_price: float
    current_price: float
    price_drop_amount: float
    price_drop_pct: float
    purchase_date: datetime
    detected_at: datetime
    currency: str = "USD"


class ClaimPlan(BaseModel):
    purchase_id: str
    user_id: str
    platform_id: str
    claim_type: ClaimType
    draft_generator: str
    output_type: str
    expected_response_format: str
    price_drop_amount: float
    price_drop_pct: float
    original_price: float
    current_price: float
    currency: str
    policy_id: str
    created_at: datetime


class ClaimPlanError(Exception):
    """Base exception for claim plan failures."""


class UnknownPlatformError(ClaimPlanError):
    """No active policy found for the given platform_id."""

    def __init__(self, platform_id: str) -> None:
        self.platform_id = platform_id
        super().__init__(f"No active policy found for platform: {platform_id!r}")


class InvalidPolicyError(ClaimPlanError):
    """Policy document has missing or unrecognized claim_type."""

    def __init__(self, platform_id: str, raw_value: Any) -> None:
        self.platform_id = platform_id
        self.raw_value = raw_value
        super().__init__(f"Policy for {platform_id!r} has invalid claim_type: {raw_value!r}")


CLAIM_TYPE_ROUTING: dict[ClaimType, dict[str, str]] = {
    ClaimType.EMAIL: {
        "draft_generator": "type_a_email",
        "output_type": "email",
        "expected_response_format": "plain_text",
    },
    ClaimType.CHAT_SCRIPT: {
        "draft_generator": "type_b_chat",
        "output_type": "chat_script",
        "expected_response_format": "markdown",
    },
    ClaimType.IN_STORE: {
        "draft_generator": "type_c_in_store",
        "output_type": "in_store_guide",
        "expected_response_format": "markdown",
    },
    ClaimType.SELF_SERVICE: {
        "draft_generator": "type_d_self_service",
        "output_type": "self_service_steps",
        "expected_response_format": "structured_json",
    },
}


async def plan_claim(
    event: PriceDroppedEvent,
    client: MongoDBClient,
) -> ClaimPlan:
    policy = await client.get_policy(event.platform_id)
    if policy is None:
        raise UnknownPlatformError(event.platform_id)

    raw_claim_type = policy.claim_type
    try:
        claim_type = ClaimType(raw_claim_type)
    except ValueError:
        raise InvalidPolicyError(event.platform_id, raw_claim_type)

    routing = CLAIM_TYPE_ROUTING[claim_type]
    _log.debug("Routing %s → %s via %s", event.platform_id, claim_type, routing["draft_generator"])

    return ClaimPlan(
        purchase_id=event.purchase_id,
        user_id=event.user_id,
        platform_id=event.platform_id,
        claim_type=claim_type,
        draft_generator=routing["draft_generator"],
        output_type=routing["output_type"],
        expected_response_format=routing["expected_response_format"],
        price_drop_amount=event.price_drop_amount,
        price_drop_pct=event.price_drop_pct,
        original_price=event.original_price,
        current_price=event.current_price,
        currency=event.currency,
        policy_id=str(policy.id),
        created_at=datetime.now(tz=timezone.utc),
    )
