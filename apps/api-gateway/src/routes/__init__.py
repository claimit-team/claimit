"""API v1 router. Subrouters added by tickets 6.2-6.6, 4.14, and 3.6."""

from fastapi import APIRouter

from . import (
    auth,
    claims,
    conversations,
    dashboard,
    events,
    gmail,
    notifications,
    policies,
    purchases,
    settings,
)

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(claims.router)
router.include_router(conversations.router)
router.include_router(dashboard.router)
router.include_router(events.router)
router.include_router(gmail.router)
router.include_router(notifications.router)
router.include_router(policies.router)
router.include_router(purchases.router)
router.include_router(settings.router)

__all__ = ["router"]
