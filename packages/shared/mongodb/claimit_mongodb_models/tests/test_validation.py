"""Tests for MongoDBClient write-path schema validation (ticket 2.11).

Covers the contract introduced by `MongoDBClient.upsert`:
- dict inputs are validated against the registered Pydantic model before
  the write hits MongoDB; on failure, `ValidationError` propagates and no
  write is attempted;
- pre-validated `BaseDocument` instances bypass revalidation.

Motor's `AsyncIOMotorClient` is mocked — these tests do not require a real
MongoDB instance.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.policy import Policy

_VALID_POLICY_ID = "00000000-0000-4000-8000-000000000019"


def _valid_policy_dict() -> dict[str, Any]:
    """Build a fresh valid policy dict for each test (so mutations don't leak)."""
    return {
        "_id": _VALID_POLICY_ID,
        "platform": "alaska",
        "category": "airline",
        "window_days": 1,
        "window_days_member": None,
        "pre_arrival_hours_required": None,
        "covers_own_drops": True,
        "covers_competitor_drops": True,
        "claim_type": "email",
        "claim_url": "https://example.com/policy",
        "claim_email": None,
        "claim_phone": None,
        "loyalty_required": False,
        "award_ticket_eligible": False,
        "bundle_exclusions": False,
        "key_exclusions": ["clause one", "clause two"],
        "policy_url": "https://example.com/policy",
        "policy_text_full": "Full policy text.",
        "policy_text_relevant_clause": "Relevant clause.",
        "last_verified": datetime(2026, 5, 14, tzinfo=UTC),
        "active": True,
    }


def _make_mocked_client() -> tuple[MongoDBClient, AsyncMock]:
    """Build a MongoDBClient whose motor pieces are AsyncMock'd.

    Returns (client, replace_one_mock) — the replace_one mock is the unit
    under inspection (we assert whether it was awaited).
    """
    client = MongoDBClient.__new__(MongoDBClient)  # bypass __init__/env check
    replace_one = AsyncMock()
    collection = MagicMock()
    collection.replace_one = replace_one
    db = MagicMock()
    db.__getitem__.return_value = collection
    client._db = db  # type: ignore[attr-defined]
    client._client = MagicMock()  # type: ignore[attr-defined]
    return client, replace_one


@pytest.mark.asyncio
async def test_valid_dict_accepted_and_written() -> None:
    client, replace_one = _make_mocked_client()
    doc = _valid_policy_dict()

    persisted_id = await client.upsert("policies", _VALID_POLICY_ID, doc)

    assert persisted_id == _VALID_POLICY_ID
    replace_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_pydantic_instance_bypasses_validation_and_writes() -> None:
    """A `BaseDocument` instance is trusted — no re-validation, write proceeds."""
    client, replace_one = _make_mocked_client()
    policy = Policy.model_validate(_valid_policy_dict())

    persisted_id = await client.upsert("policies", policy.id, policy)

    assert persisted_id == str(policy.id)
    replace_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_invalid_dict_missing_required_field_rejected() -> None:
    client, replace_one = _make_mocked_client()
    bad = _valid_policy_dict()
    del bad["platform"]  # required

    with pytest.raises(ValidationError) as exc_info:
        await client.upsert("policies", _VALID_POLICY_ID, bad)

    # Field-level detail surfaces in the error (sanity check on logging contract).
    assert any("platform" in str(err.get("loc", ())) for err in exc_info.value.errors())
    replace_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_dict_wrong_field_type_rejected() -> None:
    client, replace_one = _make_mocked_client()
    bad = _valid_policy_dict()
    bad["window_days"] = "not-an-int"  # must coerce to int

    with pytest.raises(ValidationError) as exc_info:
        await client.upsert("policies", _VALID_POLICY_ID, bad)

    assert any("window_days" in str(err.get("loc", ())) for err in exc_info.value.errors())
    replace_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_dict_bad_enum_value_rejected() -> None:
    client, replace_one = _make_mocked_client()
    bad = _valid_policy_dict()
    bad["claim_type"] = "carrier-pigeon"  # not in ClaimType enum

    with pytest.raises(ValidationError):
        await client.upsert("policies", _VALID_POLICY_ID, bad)

    replace_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_unregistered_collection_with_dict_input_raises() -> None:
    """dict input requires a model registration; an unknown collection errors out."""
    client, replace_one = _make_mocked_client()

    with pytest.raises(ValueError, match="No Pydantic model registered"):
        await client.upsert("totally_made_up", _VALID_POLICY_ID, _valid_policy_dict())

    replace_one.assert_not_awaited()
