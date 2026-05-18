"""Dashboard summary aggregation service.

Single source of truth for /dashboard/summary metric computation. Heavy
lifting is one MongoDB aggregation with $facet to compute the four
claims-side metrics in a single round-trip, plus a separate count on
purchases.

See Attachment 2 §3.7 for the response shape.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from claimit_mongodb_models import MongoDBClient

# Outcomes counted toward "savings" totals.
# - approved: refund received via email/chat (Best Buy, Hilton hero flows).
# - user_self_service: user self-actioned with confirmed savings (Southwest
#   hero flow — rebooked for voucher).
_SAVINGS_OUTCOMES: list[str] = ["approved", "user_self_service"]

_ACTIVE_OUTCOMES: list[str] = ["draft_pending", "pending"]

_MONITORING_STATUSES: list[str] = ["monitoring", "monitoring_degraded"]

_RECENT_RESOLVED_LIMIT: int = 5


def _start_of_current_month_utc() -> datetime:
    """First moment of the current UTC calendar month."""
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _start_of_next_month_utc(start_of_month: datetime) -> datetime:
    """First moment of the calendar month after `start_of_month`.

    Pure function so tests can verify the December -> January year rollover
    independently of `datetime.now()`.
    """
    if start_of_month.month == 12:
        return start_of_month.replace(
            year=start_of_month.year + 1,
            month=1,
        )
    return start_of_month.replace(month=start_of_month.month + 1)


def _first_total(facet_result: list[dict[str, Any]]) -> float:
    """Extract sum from a $group facet output; default 0.0 if empty."""
    if not facet_result:
        return 0.0
    return float(facet_result[0].get("total", 0.0))


def _first_count(facet_result: list[dict[str, Any]]) -> int:
    """Extract count from a $count facet output; default 0 if empty."""
    if not facet_result:
        return 0
    return int(facet_result[0].get("count", 0))


def _build_claims_pipeline(
    user_id: UUID,
    start_of_month: datetime,
) -> list[dict[str, Any]]:
    """Construct the $facet pipeline that produces all 4 claims-side metrics."""
    start_of_next_month = _start_of_next_month_utc(start_of_month)
    return [
        {"$match": {"user_id": user_id}},
        {
            "$facet": {
                "savings_month": [
                    {
                        "$match": {
                            "outcome": {"$in": _SAVINGS_OUTCOMES},
                            "resolved_at": {
                                "$gte": start_of_month,
                                "$lt": start_of_next_month,
                            },
                        }
                    },
                    {"$group": {"_id": None, "total": {"$sum": "$claim_amount"}}},
                ],
                "savings_lifetime": [
                    {
                        "$match": {
                            "outcome": {"$in": _SAVINGS_OUTCOMES},
                            "resolved_at": {"$ne": None},
                        }
                    },
                    {"$group": {"_id": None, "total": {"$sum": "$claim_amount"}}},
                ],
                "active_count": [
                    {"$match": {"outcome": {"$in": _ACTIVE_OUTCOMES}}},
                    {"$count": "count"},
                ],
                "recent_resolved": [
                    {"$match": {"resolved_at": {"$ne": None}}},
                    {"$sort": {"resolved_at": -1}},
                    {"$limit": _RECENT_RESOLVED_LIMIT},
                    {
                        "$project": {
                            "_id": 0,
                            "claim_id": {"$toString": "$_id"},
                            "platform": 1,
                            "outcome": 1,
                            "amount": "$claim_amount",
                        }
                    },
                ],
            }
        },
    ]


async def get_summary(
    db: MongoDBClient,
    user_id: UUID,
) -> dict[str, object]:
    """Compute the dashboard summary for `user_id`.

    Returns the response payload as a naked dict (no envelope; the route
    handler returns this directly, matching auth.py and gmail.py).
    """
    pipeline = _build_claims_pipeline(user_id, _start_of_current_month_utc())
    claims_results = await db.aggregate("claims", pipeline)
    claims_doc = claims_results[0] if claims_results else {}

    monitoring_count = await db.count(
        "purchases",
        {"user_id": user_id, "status": {"$in": _MONITORING_STATUSES}},
    )

    return {
        "total_savings_month": _first_total(claims_doc.get("savings_month", [])),
        "total_savings_lifetime": _first_total(claims_doc.get("savings_lifetime", [])),
        "active_claims_count": _first_count(claims_doc.get("active_count", [])),
        "monitoring_purchases_count": monitoring_count,
        "recent_resolved": claims_doc.get("recent_resolved", []),
    }
