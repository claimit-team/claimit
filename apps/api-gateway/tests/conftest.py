"""Shared pytest fixtures for the api-gateway test suite."""

from __future__ import annotations

import pytest
import pytest_asyncio
from claimit_mongodb_models import User
from fastapi import Depends
from httpx import ASGITransport, AsyncClient

from src.main import app
from src.middleware.auth import get_current_user


# Stub route used by auth middleware tests (tickets 6.2+ will add the real one).
@app.api_route("/api/v1/auth/me", methods=["GET", "POST"])
async def _test_auth_me(user: User = Depends(get_current_user)) -> dict[str, object]:
    return {"user": user.model_dump()}


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
