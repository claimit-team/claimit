"""Gmail integration status endpoint: /gmail/status.

The /gmail/connect and /gmail/callback endpoints are owned by ticket 4.14
and will be added to this same module (or split if it grows large).
"""

from __future__ import annotations

from typing import Annotated

from claimit_mongodb_models import User
from fastapi import APIRouter, Depends

from ..middleware.auth import get_current_user

router = APIRouter(prefix="/gmail", tags=["gmail"])


@router.get("/status")
async def get_gmail_status(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    """Return Gmail integration status for the authenticated user.

    NOTE: GmailIntegration model has no `email` field today. When connected,
    we surface the authenticated user's email (assumes the user connected
    their own primary Gmail, true for hackathon demo). 4.14 may need to add
    a dedicated `connected_email` field if multi-Gmail support becomes a
    requirement; tracked in implementation coordination with 4.14 owner.
    """
    g = user.gmail_integration
    return {
        "connected": g.connected,
        "email": user.email if g.connected else None,
        "scopes": list(g.scopes_granted),
    }
