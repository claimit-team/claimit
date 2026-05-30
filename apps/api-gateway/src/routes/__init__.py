"""API v1 router. Subrouters added by tickets 6.2-6.6, 4.14, and 3.6."""

from fastapi import APIRouter

from . import (
    auth,
    careers,
    claims,
    conversations,
    dashboard,
    events,
    gmail,
    marketing,
    notifications,
    policies,
    purchases,
    settings,
)
from . import (
    help as help_routes,
)

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(careers.router)
router.include_router(claims.router)
router.include_router(conversations.router)
router.include_router(dashboard.router)
router.include_router(events.router)
router.include_router(gmail.router)
router.include_router(help_routes.router)
router.include_router(marketing.router)
router.include_router(notifications.router)
router.include_router(policies.router)
router.include_router(purchases.router)
router.include_router(settings.router)

__all__ = ["router"]
