"""Unit tests for Mode B handle_message SSE partial streaming."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from google.adk.agents.run_config import StreamingMode
from src.mode_b import handle_message

_USER_ID = "11111111-1111-4111-8111-111111111111"
_CLAIM_ID = "22222222-2222-4222-8222-222222222222"


def _mock_adk_event(
    *,
    partial: bool,
    text: str | None = None,
    is_final: bool = False,
) -> MagicMock:
    part = MagicMock()
    part.text = text
    part.function_call = None
    part.function_response = None
    event = MagicMock()
    event.partial = partial
    event.content = MagicMock()
    event.content.parts = [part] if text is not None else []
    event.is_final_response = MagicMock(return_value=is_final)
    return event


def _patch_runner(events: list[Any], captured: dict[str, Any]):
    async def _fake_run_async(**kwargs: Any):
        captured.update(kwargs)
        for event in events:
            yield event

    mock_runner = MagicMock()
    mock_runner.run_async = _fake_run_async
    return patch("src.mode_b.Runner", return_value=mock_runner)


@pytest.mark.asyncio
async def test_handle_message_sse_partial_deltas_no_final_duplicate() -> None:
    events = [
        _mock_adk_event(partial=True, text="A"),
        _mock_adk_event(partial=True, text="B"),
        _mock_adk_event(partial=True, text="C"),
        _mock_adk_event(partial=False, text="ABC", is_final=True),
    ]
    captured: dict[str, Any] = {}

    with _patch_runner(events, captured):
        frames = [f async for f in handle_message(_USER_ID, _CLAIM_ID, "hello")]

    assert captured["run_config"].streaming_mode == StreamingMode.SSE
    text_chunks = [json.loads(f["data"])["text"] for f in frames if f["event"] == "text_chunk"]
    assert text_chunks == ["A", "B", "C"]
    assert "ABC" not in text_chunks
    assert any(f["event"] == "done" for f in frames)


@pytest.mark.asyncio
async def test_handle_message_sse_no_partials_fallback_single_chunk() -> None:
    events = [_mock_adk_event(partial=False, text="ABC", is_final=True)]
    captured: dict[str, Any] = {}

    with _patch_runner(events, captured):
        frames = [f async for f in handle_message(_USER_ID, _CLAIM_ID, "hello")]

    text_chunks = [json.loads(f["data"])["text"] for f in frames if f["event"] == "text_chunk"]
    assert text_chunks == ["ABC"]
    assert any(f["event"] == "done" for f in frames)
