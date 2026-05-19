"""Tests for GET /api/v1/events/stream.

The SSE handler consumes an unbounded generator. Tests patch
event_stream_generator with a finite or controllable async iterator and
use httpx.AsyncClient.stream() + aiter_text() to read frames.

Every aiter_text read is wrapped in asyncio.wait_for(..., timeout=2.0):
if the patch is ineffective or the generator never yields, the
underlying iterator blocks forever — the explicit timeout converts that
into a fast, deterministic test failure.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
from claimit_mongodb_models import MongoDBClient, User
from httpx import ASGITransport, AsyncClient
from src.deps import get_db
from src.main import app

from ._fixtures import USER_FIXTURE, make_notification_event

_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}
_FRAME_TIMEOUT_SECONDS = 2.0


def _mock_db() -> AsyncMock:
    """DB mock: find_one returns a fresh User per call (auth middleware)."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_args, **_kwargs: User.model_validate(USER_FIXTURE))
    return db


async def _finite_generator(frames: list[dict[str, str]]) -> AsyncIterator[dict[str, str]]:
    """Yield `frames` then return (closes the SSE stream).

    The real generator runs forever, but tests need the response stream
    to terminate so the test process can exit. sse-starlette emits a
    final close event when the wrapped iterator returns.
    """
    for f in frames:
        yield f


async def _read_one_frame(resp_stream: AsyncIterator[str]) -> str:
    """Read one SSE frame group with a 2s timeout. sse-starlette emits
    frames in chunks; collect text until the SSE terminator (\\r\\n\\r\\n
    or \\n\\n) appears."""
    buffer = ""
    while True:
        chunk = await asyncio.wait_for(resp_stream.__anext__(), timeout=_FRAME_TIMEOUT_SECONDS)
        buffer += chunk
        if "\r\n\r\n" in buffer or "\n\n" in buffer:
            return buffer


@pytest.fixture
async def stream_client() -> AsyncClient:
    """Dedicated AsyncClient for streaming responses.

    The shared `client` fixture in conftest.py is fine for normal
    request/response, but SSE streaming benefits from being scoped to a
    single test so the ASGI transport is torn down after each one.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_missing_token_returns_401(stream_client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await stream_client.get("/api/v1/events/stream")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stream_invalid_token_returns_401(stream_client: AsyncClient) -> None:
    import firebase_admin.auth

    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=firebase_admin.auth.InvalidIdTokenError("bad token"),
        ):
            response = await stream_client.get("/api/v1/events/stream?token=bad")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"
    finally:
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_returns_sse_content_type(stream_client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with (
            patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS),
            patch(
                "src.routes.events.event_stream_generator",
                lambda *_args, **_kwargs: _finite_generator([]),
            ),
        ):
            async with stream_client.stream("GET", "/api/v1/events/stream?token=valid") as resp:
                assert resp.status_code == 200
                content_type = resp.headers.get("content-type", "")
                assert content_type.startswith("text/event-stream")
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stream_emits_notification_frame(stream_client: AsyncClient) -> None:
    db = _mock_db()
    notif_doc = make_notification_event()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with (
            patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS),
            patch(
                "src.routes.events.event_stream_generator",
                lambda *_args, **_kwargs: _finite_generator(
                    [{"event": "notification", "data": json.dumps(notif_doc)}]
                ),
            ),
        ):
            async with stream_client.stream("GET", "/api/v1/events/stream?token=valid") as resp:
                assert resp.status_code == 200
                frame = await _read_one_frame(resp.aiter_text())

        assert "event: notification" in frame
        assert notif_doc["_id"] in frame
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stream_emits_error_frame(stream_client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with (
            patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS),
            patch(
                "src.routes.events.event_stream_generator",
                lambda *_args, **_kwargs: _finite_generator(
                    [
                        {
                            "event": "error",
                            "data": json.dumps({"message": "Stream temporarily unavailable"}),
                        }
                    ]
                ),
            ),
        ):
            async with stream_client.stream("GET", "/api/v1/events/stream?token=valid") as resp:
                assert resp.status_code == 200
                frame = await _read_one_frame(resp.aiter_text())

        assert "event: error" in frame
        assert "Stream temporarily unavailable" in frame
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stream_emits_multiple_frames_in_order(stream_client: AsyncClient) -> None:
    db = _mock_db()
    notif_a = make_notification_event(notification_id="40000000-0000-0000-0000-0000000000aa")
    notif_b = make_notification_event(notification_id="40000000-0000-0000-0000-0000000000bb")

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with (
            patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS),
            patch(
                "src.routes.events.event_stream_generator",
                lambda *_args, **_kwargs: _finite_generator(
                    [
                        {"event": "notification", "data": json.dumps(notif_a)},
                        {"event": "notification", "data": json.dumps(notif_b)},
                    ]
                ),
            ),
        ):
            async with stream_client.stream("GET", "/api/v1/events/stream?token=valid") as resp:
                assert resp.status_code == 200
                combined = ""
                stream_iter = resp.aiter_text()
                while True:
                    try:
                        chunk = await asyncio.wait_for(
                            stream_iter.__anext__(),
                            timeout=_FRAME_TIMEOUT_SECONDS,
                        )
                    except StopAsyncIteration:
                        break
                    combined += chunk

        # sse-starlette may batch frames into one chunk; check both _ids
        # appear and a's position precedes b's in the combined output.
        idx_a = combined.find(str(notif_a["_id"]))
        idx_b = combined.find(str(notif_b["_id"]))
        assert idx_a >= 0
        assert idx_b >= 0
        assert idx_a < idx_b
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stream_passes_authenticated_user_id_to_generator(
    stream_client: AsyncClient,
) -> None:
    """The route hands user.id (not user.email or token) to the generator."""
    db = _mock_db()
    captured: dict[str, object] = {}

    def _capture(_db: MongoDBClient, user_id: object) -> AsyncIterator[dict[str, str]]:
        captured["user_id"] = user_id
        return _finite_generator([])

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with (
            patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS),
            patch("src.routes.events.event_stream_generator", _capture),
        ):
            async with stream_client.stream("GET", "/api/v1/events/stream?token=valid") as resp:
                assert resp.status_code == 200

        assert captured["user_id"] == User.model_validate(USER_FIXTURE).id
    finally:
        app.dependency_overrides.pop(get_db, None)
