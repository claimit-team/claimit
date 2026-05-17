"""API v1 router - routes are added by tickets 6.2-6.6."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

__all__ = ["router"]
