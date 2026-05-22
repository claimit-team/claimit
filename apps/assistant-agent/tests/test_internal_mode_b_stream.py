"""Tests for POST /internal/mode-b/stream (ticket 5.9)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from src.main import app

_USER_ID = "11111111-1111-4111-8111-111111111111"
_CLAIM_ID = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _disable_internal_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_AUTH_DISABLED", "1")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


async def _fake_handle_message(
    user_id: str,
    claim_id: str,
    message: str,
    *,
    history: Any = None,
) -> AsyncIterator[dict[str, Any]]:
    assert user_id == _USER_ID
    assert claim_id == _CLAIM_ID
    assert message == "hello"
    assert history is not None
    assert len(history) == 1
    assert history[0].role == "user"
    assert history[0].content == "prior"
    yield {"event": "text_chunk", "data": '{"text": "hi"}'}
    yield {"event": "done", "data": "{}"}


def test_internal_mode_b_stream_requires_auth_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("INTERNAL_AUTH_DISABLED", raising=False)
    client = TestClient(app)
    response = client.post(
        "/internal/mode-b/stream",
        json={
            "user_id": _USER_ID,
            "claim_id": _CLAIM_ID,
            "message": "hello",
            "messages": [],
        },
    )
    assert response.status_code == 401


def test_internal_mode_b_stream_yields_sse_frames(client: TestClient) -> None:
    with patch("src.main.handle_message", side_effect=_fake_handle_message):
        response = client.post(
            "/internal/mode-b/stream",
            json={
                "user_id": _USER_ID,
                "claim_id": _CLAIM_ID,
                "message": "hello",
                "messages": [{"role": "user", "content": "prior"}],
            },
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: text_chunk" in body
    assert '"text": "hi"' in body
    assert "event: done" in body


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok", "agent": "assistant"}
