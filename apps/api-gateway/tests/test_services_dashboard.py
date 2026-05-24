"""Tests for src.services.dashboard.get_summary."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import Claim, MongoDBClient, Purchase
from src.services import dashboard

from ._fixtures import make_claim, make_purchase

_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


def _mock_db(
    *,
    claims_facet: dict[str, list[dict]] | None = None,
    monitoring_count: int = 0,
) -> AsyncMock:
    """Build an AsyncMock MongoDBClient with the two methods get_summary uses."""
    db = AsyncMock(spec=MongoDBClient)
    db.aggregate = AsyncMock(return_value=[claims_facet] if claims_facet is not None else [{}])
    db.count = AsyncMock(return_value=monitoring_count)
    return db


@pytest.mark.asyncio
async def test_empty_user_returns_zeros() -> None:
    """User with no claims and no purchases: all metrics zero, empty list."""
    db = _mock_db(
        claims_facet={
            "savings_month": [],
            "savings_lifetime": [],
            "active_count": [],
            "recent_resolved": [],
        },
        monitoring_count=0,
    )
    result = await dashboard.get_summary(db, _USER_ID)
    assert result == {
        "total_savings_month": 0.0,
        "total_savings_lifetime": 0.0,
        "active_claims_count": 0,
        "monitoring_purchases_count": 0,
        "recent_resolved": [],
    }


@pytest.mark.asyncio
async def test_savings_month_extracted_from_facet() -> None:
    db = _mock_db(
        claims_facet={
            "savings_month": [{"_id": None, "total": 125.5}],
            "savings_lifetime": [{"_id": None, "total": 875.0}],
            "active_count": [],
            "recent_resolved": [],
        },
    )
    result = await dashboard.get_summary(db, _USER_ID)
    assert result["total_savings_month"] == 125.5
    assert result["total_savings_lifetime"] == 875.0


@pytest.mark.asyncio
async def test_active_claims_count_extracted_from_facet() -> None:
    db = _mock_db(
        claims_facet={
            "savings_month": [],
            "savings_lifetime": [],
            "active_count": [{"count": 3}],
            "recent_resolved": [],
        },
    )
    result = await dashboard.get_summary(db, _USER_ID)
    assert result["active_claims_count"] == 3


@pytest.mark.asyncio
async def test_monitoring_purchases_count_uses_db_count() -> None:
    db = _mock_db(monitoring_count=7)
    result = await dashboard.get_summary(db, _USER_ID)
    assert result["monitoring_purchases_count"] == 7
    # Verify the filter passed to count() matches design decision: both
    # "monitoring" and "monitoring_degraded" qualify.
    db.count.assert_called_once()
    call_args = db.count.call_args
    collection_arg = call_args.args[0] if call_args.args else call_args.kwargs["collection"]
    filter_arg = call_args.args[1] if len(call_args.args) > 1 else call_args.kwargs["filter"]
    assert collection_arg == "purchases"
    assert filter_arg == {
        "user_id": _USER_ID,
        "status": {"$in": ["monitoring", "monitoring_degraded"]},
    }


@pytest.mark.asyncio
async def test_recent_resolved_passed_through_as_is() -> None:
    """Service preserves whatever the $project stage emitted."""
    fixture_items = [
        {"claim_id": "abc", "platform": "best_buy", "outcome": "approved", "amount": 50.0},
        {"claim_id": "def", "platform": "hilton", "outcome": "denied", "amount": 75.0},
    ]
    db = _mock_db(
        claims_facet={
            "savings_month": [],
            "savings_lifetime": [],
            "active_count": [],
            "recent_resolved": fixture_items,
        },
    )
    result = await dashboard.get_summary(db, _USER_ID)
    assert result["recent_resolved"] == fixture_items


@pytest.mark.asyncio
async def test_pipeline_filters_by_user_id() -> None:
    db = _mock_db()
    await dashboard.get_summary(db, _USER_ID)
    db.aggregate.assert_called_once()
    call_args = db.aggregate.call_args
    collection_arg = call_args.args[0] if call_args.args else call_args.kwargs["collection"]
    pipeline_arg = call_args.args[1] if len(call_args.args) > 1 else call_args.kwargs["pipeline"]
    assert collection_arg == "claims"
    assert pipeline_arg[0] == {"$match": {"user_id": _USER_ID}}


@pytest.mark.asyncio
async def test_pipeline_uses_correct_savings_outcomes() -> None:
    """approved + user_self_service both count toward savings (locked decision)."""
    db = _mock_db()
    await dashboard.get_summary(db, _USER_ID)
    pipeline = db.aggregate.call_args.args[1]
    facet_stage = pipeline[1]["$facet"]

    month_match = facet_stage["savings_month"][0]["$match"]
    lifetime_match = facet_stage["savings_lifetime"][0]["$match"]
    assert month_match["outcome"] == {"$in": ["approved", "user_self_service"]}
    assert lifetime_match["outcome"] == {"$in": ["approved", "user_self_service"]}


@pytest.mark.asyncio
async def test_pipeline_uses_correct_active_outcomes() -> None:
    """draft_pending + pending = active (locked decision)."""
    db = _mock_db()
    await dashboard.get_summary(db, _USER_ID)
    pipeline = db.aggregate.call_args.args[1]
    active_match = pipeline[1]["$facet"]["active_count"][0]["$match"]
    assert active_match["outcome"] == {"$in": ["draft_pending", "pending"]}


@pytest.mark.asyncio
async def test_pipeline_recent_resolved_limit_and_sort() -> None:
    db = _mock_db()
    await dashboard.get_summary(db, _USER_ID)
    pipeline = db.aggregate.call_args.args[1]
    recent_stages = pipeline[1]["$facet"]["recent_resolved"]
    # Must filter non-null, sort desc by resolved_at, limit 5.
    assert recent_stages[0] == {"$match": {"resolved_at": {"$ne": None}}}
    assert recent_stages[1] == {"$sort": {"resolved_at": -1}}
    assert recent_stages[2] == {"$limit": 5}


@pytest.mark.asyncio
async def test_pipeline_savings_sums_ifnull_reclaimed_amount() -> None:
    db = _mock_db()
    await dashboard.get_summary(db, _USER_ID)
    pipeline = db.aggregate.call_args.args[1]
    facet_stage = pipeline[1]["$facet"]
    expected_sum = {"$sum": {"$ifNull": ["$reclaimed_amount", "$claim_amount"]}}

    month_group = facet_stage["savings_month"][1]["$group"]
    lifetime_group = facet_stage["savings_lifetime"][1]["$group"]
    assert month_group["total"] == expected_sum
    assert lifetime_group["total"] == expected_sum


@pytest.mark.asyncio
async def test_pipeline_recent_resolved_amount_uses_ifnull() -> None:
    db = _mock_db()
    await dashboard.get_summary(db, _USER_ID)
    pipeline = db.aggregate.call_args.args[1]
    project_stage = pipeline[1]["$facet"]["recent_resolved"][3]["$project"]
    assert project_stage["amount"] == {"$ifNull": ["$reclaimed_amount", "$claim_amount"]}


@pytest.mark.asyncio
async def test_pipeline_month_filter_uses_utc_start_of_month() -> None:
    """Locked design decision: month = UTC calendar month (start inclusive, end exclusive)."""
    db = _mock_db()
    await dashboard.get_summary(db, _USER_ID)
    pipeline = db.aggregate.call_args.args[1]
    month_match = pipeline[1]["$facet"]["savings_month"][0]["$match"]
    resolved_at_filter = month_match["resolved_at"]

    assert "$gte" in resolved_at_filter
    assert "$lt" in resolved_at_filter

    lower = resolved_at_filter["$gte"]
    # Lower bound is some month's first day at UTC midnight. We don't assert
    # WHICH month (that would race with `datetime.now(UTC)` at UTC month
    # rollover); we assert structural properties + that the upper bound is
    # exactly one calendar month later via the helper.
    assert lower.day == 1
    assert lower.hour == 0
    assert lower.minute == 0
    assert lower.second == 0
    assert lower.microsecond == 0
    assert lower.tzinfo == UTC

    upper = resolved_at_filter["$lt"]
    # Upper bound must equal lower + 1 calendar month. The helper itself is
    # verified by test_start_of_next_month_utc_december_rollover and
    # test_start_of_next_month_utc_normal_month below.
    assert upper == dashboard._start_of_next_month_utc(lower)


@pytest.mark.asyncio
async def test_aggregate_returns_empty_list_handled_gracefully() -> None:
    """If aggregate() unexpectedly returns [], all metrics default to zero."""
    db = AsyncMock(spec=MongoDBClient)
    db.aggregate = AsyncMock(return_value=[])
    db.count = AsyncMock(return_value=0)
    result = await dashboard.get_summary(db, _USER_ID)
    assert result == {
        "total_savings_month": 0.0,
        "total_savings_lifetime": 0.0,
        "active_claims_count": 0,
        "monitoring_purchases_count": 0,
        "recent_resolved": [],
    }


# ---------------------------------------------------------------------------
# Builder smoke tests — prove the fixtures match the Pydantic schemas so PR B
# onward does not inherit silently-broken builders. The dashboard tests above
# use mocked aggregate output and never validate these dicts; without these
# smoke tests an enum-value typo in make_claim/make_purchase would go silent.
# ---------------------------------------------------------------------------


def test_make_claim_validates_against_pydantic() -> None:
    Claim.model_validate(make_claim())


def test_make_purchase_validates_against_pydantic() -> None:
    Purchase.model_validate(make_purchase())


# ---------------------------------------------------------------------------
# Helper-level unit tests for _start_of_next_month_utc — pure function with a
# December rollover edge case that should never depend on `datetime.now()` to
# verify. These guard the upper-bound contract enforced by the savings_month
# pipeline (start inclusive, end exclusive).
# ---------------------------------------------------------------------------


def test_start_of_next_month_utc_december_rollover() -> None:
    """December -> January of next year, with year incremented."""
    from src.services.dashboard import _start_of_next_month_utc

    dec_2026 = datetime(2026, 12, 1, 0, 0, 0, tzinfo=UTC)
    assert _start_of_next_month_utc(dec_2026) == datetime(
        2027,
        1,
        1,
        0,
        0,
        0,
        tzinfo=UTC,
    )


def test_start_of_next_month_utc_normal_month() -> None:
    """Non-December months just increment the month component."""
    from src.services.dashboard import _start_of_next_month_utc

    may_2026 = datetime(2026, 5, 1, 0, 0, 0, tzinfo=UTC)
    assert _start_of_next_month_utc(may_2026) == datetime(
        2026,
        6,
        1,
        0,
        0,
        0,
        tzinfo=UTC,
    )
