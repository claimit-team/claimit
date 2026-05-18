"""API v1 router. Subrouters added by tickets 6.2-6.6 and 4.14."""

from fastapi import APIRouter

from . import auth, dashboard, gmail, notifications, settings

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(dashboard.router)
router.include_router(gmail.router)
router.include_router(notifications.router)
router.include_router(settings.router)

__all__ = ["router"]
