"""Policy lookup endpoint.

GET /api/v1/policies/{platform} — read-only window summary for a single
platform. Surfaced primarily so the confirm page can recompute the
price-protection-window expiry reactively as the user edits
platform/purchase_date/member_tier inputs (BUG-59). Server-side
`confirm_purchase` still has the authoritative `compute_window_days`
call; this endpoint just exposes the numbers the FE needs to render the
"outside the window" informational banner before submission.

Auth-required (Depends(get_current_user)) for parity with the rest of
the gateway — policy rows are not PII but every other route requires
auth and we don't want an unauthenticated surface to enumerate.
"""

from __future__ import annotations

from typing import Annotated

from claimit_mongodb_models import ClaimType, MongoDBClient, Platform, User
from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError

router = APIRouter(prefix="/policies", tags=["policies"])


class PolicyWindowResponse(BaseModel):
    platform: Platform
    window_days: int
    window_days_member: int | None
    claim_type: ClaimType


@router.get("/{platform}")
async def get_policy_window(
    platform: Annotated[Platform, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> PolicyWindowResponse:
    """Return the window-days summary for an active policy, or 404."""
    policy = await db.get_policy(platform.value)
    if policy is None:
        raise ApiError(
            "policy_not_found",
            f"No active policy for {platform.value}",
            status_code=404,
        )
    return PolicyWindowResponse(
        platform=policy.platform,
        window_days=policy.window_days,
        window_days_member=policy.window_days_member,
        claim_type=policy.claim_type,
    )
