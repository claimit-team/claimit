"""Shared pytest fixtures for the api-gateway test suite."""

from __future__ import annotations

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from src.main import app


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
