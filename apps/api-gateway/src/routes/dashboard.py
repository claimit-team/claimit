"""Dashboard summary endpoint: GET /dashboard/summary.

Returns aggregated savings / active claims / monitoring purchases /
recent resolved claims for the authenticated user.

See Attachment 2 §3.7 for the response contract.
"""

from __future__ import annotations

from typing import Annotated

from claimit_mongodb_models import MongoDBClient, User
from fastapi import APIRouter, Depends

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_dashboard_summary(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Return aggregated dashboard summary for the authenticated user.

    Response (Attachment 2 §3.7):
        total_savings_month: float — sum of claim_amount where outcome in
          (approved, user_self_service) AND resolved this UTC month.
        total_savings_lifetime: float — same outcomes, no date filter.
        active_claims_count: int — claims with outcome in
          (draft_pending, pending).
        monitoring_purchases_count: int — purchases with status in
          (monitoring, monitoring_degraded).
        recent_resolved: list[{claim_id, platform, outcome, amount}] — up to
          5 most recent resolved claims regardless of outcome, sorted by
          resolved_at desc.
    """
    return await dashboard.get_summary(db, user.id)
