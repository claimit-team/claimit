"""Shared error types and FastAPI exception handlers."""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse

_log = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    error: dict[str, object] = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        error["details"] = exc.details
    return JSONResponse({"error": error}, status_code=exc.status_code)


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    _log.error("Unhandled exception on %s %s", request.method, request.url, exc_info=exc)
    return JSONResponse(
        {"error": {"code": "internal_error", "message": "An unexpected error occurred"}},
        status_code=500,
    )
