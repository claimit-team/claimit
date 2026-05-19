"""Unit tests for conversation_service.py (task 6.5)"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.conversation import Conversation, ToolCall
from claimit_mongodb_models.enums import ConversationMode, ConversationStatus, MessageRole
from src.services.conversation_service import (
    append_message,
    create_conversation,
    get_conversation_for_user,
    stream_agent_response,
)

USER_ID = UUID("00000000-0000-0000-0000-000000000001")
OTHER_USER_ID = UUID("00000000-0000-0000-0000-000000000002")
CONV_ID = UUID("10000000-0000-0000-0000-000000000001")
CLAIM_ID = UUID("20000000-0000-0000-0000-000000000001")


def _make_db() -> AsyncMock:
    db = AsyncMock(spec=MongoDBClient)
    db.upsert_conversation = AsyncMock(return_value=None)
    db.get_conversation = AsyncMock(return_value=None)
    return db


def _make_conversation(
    user_id: UUID = USER_ID,
    mode: ConversationMode = ConversationMode.GENERAL,
    claim_id: UUID | None = None,
) -> Conversation:
    now = datetime.now(UTC)
    return Conversation(
        id=CONV_ID,
        user_id=user_id,
        mode=mode,
        claim_id=claim_id,
        title="Test Conversation",
        messages=[],
        trace_ids=[],
        status=ConversationStatus.ACTIVE,
        created_at=now,
        last_message_at=now,
        archived_at=None,
    )


# ---------------------------------------------------------------------------
# Group 1: create_conversation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_conversation_claim_focused_without_claim_id_raises() -> None:
    db = _make_db()
    with pytest.raises(ValueError, match="claim_id is required"):
        await create_conversation(db, USER_ID, ConversationMode.CLAIM_FOCUSED, None)
    db.upsert_conversation.assert_not_called()


@pytest.mark.asyncio
async def test_create_conversation_claim_focused_with_claim_id_succeeds() -> None:
    db = _make_db()
    conv = await create_conversation(db, USER_ID, ConversationMode.CLAIM_FOCUSED, CLAIM_ID)
    assert conv.mode == ConversationMode.CLAIM_FOCUSED
    assert conv.claim_id == CLAIM_ID
    assert conv.messages == []
    assert conv.status == ConversationStatus.ACTIVE
    db.upsert_conversation.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_conversation_general_without_claim_id_succeeds() -> None:
    db = _make_db()
    conv = await create_conversation(db, USER_ID, ConversationMode.GENERAL, None)
    assert conv.mode == ConversationMode.GENERAL
    assert conv.claim_id is None


# ---------------------------------------------------------------------------
# Group 2: get_conversation_for_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_conversation_not_found_raises_value_error() -> None:
    db = _make_db()
    db.get_conversation = AsyncMock(return_value=None)
    with pytest.raises(ValueError):
        await get_conversation_for_user(db, CONV_ID, USER_ID)


@pytest.mark.asyncio
async def test_get_conversation_wrong_user_raises_permission_error() -> None:
    db = _make_db()
    conv = _make_conversation(user_id=USER_ID)
    db.get_conversation = AsyncMock(return_value=conv)
    with pytest.raises(PermissionError):
        await get_conversation_for_user(db, CONV_ID, OTHER_USER_ID)


@pytest.mark.asyncio
async def test_get_conversation_correct_user_returns_conversation() -> None:
    db = _make_db()
    conv = _make_conversation(user_id=USER_ID)
    db.get_conversation = AsyncMock(return_value=conv)
    result = await get_conversation_for_user(db, CONV_ID, USER_ID)
    assert result is conv


# ---------------------------------------------------------------------------
# Group 3: append_message
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_append_message_adds_message_and_updates_timestamp() -> None:
    db = _make_db()
    conv = _make_conversation()
    original_last_message_at = conv.last_message_at

    result = await append_message(db, conv, MessageRole.USER, "hello")

    assert len(result.messages) == 1
    assert result.messages[0].role == MessageRole.USER
    assert result.messages[0].content == "hello"
    assert result.last_message_at >= original_last_message_at
    db.upsert_conversation.assert_awaited_once()


@pytest.mark.asyncio
async def test_append_message_persists_tool_calls() -> None:
    db = _make_db()
    conv = _make_conversation()
    tool_call = ToolCall(
        tool="mongodb_query",
        input={"collection": "claims"},
        output_summary="found 3 claims",
        at=datetime.now(UTC),
    )

    result = await append_message(db, conv, MessageRole.ASSISTANT, "result", tool_calls=[tool_call])

    assert result.messages[0].tool_calls is not None
    assert len(result.messages[0].tool_calls) == 1
    assert result.messages[0].tool_calls[0].tool == "mongodb_query"


# ---------------------------------------------------------------------------
# Group 4: stream_agent_response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_no_agent_env_var_yields_done_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_ASSISTANT_AGENT_ID", raising=False)
    conv = _make_conversation()

    with patch("vertexai.agent_engines.get") as mock_get:
        events = [e async for e in stream_agent_response(USER_ID, conv, "hello")]

    assert len(events) == 1
    assert events[0]["event"] == "done"
    assert "error" in json.loads(events[0]["data"])
    mock_get.assert_not_called()


@pytest.mark.asyncio
async def test_stream_text_parts_yield_text_chunk_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    conv = _make_conversation()

    async def _fake_stream(**kwargs):
        yield {"content": {"parts": [{"text": "Hello "}]}}
        yield {"content": {"parts": [{"text": "world"}]}}

    mock_agent = MagicMock()
    mock_agent.async_stream_query = _fake_stream

    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(USER_ID, conv, "hi")]

    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 2
    assert json.loads(text_chunks[0]["data"])["text"] == "Hello "
    assert json.loads(text_chunks[1]["data"])["text"] == "world"

    done_events = [e for e in events if e["event"] == "done"]
    assert len(done_events) == 1
    assert json.loads(done_events[0]["data"])["final_message"] == "Hello world"


@pytest.mark.asyncio
async def test_stream_function_call_yields_tool_call_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    conv = _make_conversation()

    async def _fake_stream(**kwargs):
        yield {
            "content": {
                "parts": [
                    {"function_call": {"name": "mongodb_query", "args": {"collection": "claims"}}}
                ]
            }
        }

    mock_agent = MagicMock()
    mock_agent.async_stream_query = _fake_stream

    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(USER_ID, conv, "hi")]

    tool_calls = [e for e in events if e["event"] == "tool_call"]
    assert len(tool_calls) == 1
    assert json.loads(tool_calls[0]["data"])["tool"] == "mongodb_query"


@pytest.mark.asyncio
async def test_stream_function_response_yields_tool_result_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    conv = _make_conversation()

    async def _fake_stream(**kwargs):
        yield {
            "content": {
                "parts": [
                    {"function_response": {"name": "mongodb_query", "response": {"data": []}}}
                ]
            }
        }

    mock_agent = MagicMock()
    mock_agent.async_stream_query = _fake_stream

    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(USER_ID, conv, "hi")]

    tool_results = [e for e in events if e["event"] == "tool_result"]
    assert len(tool_results) == 1
    assert json.loads(tool_results[0]["data"])["tool"] == "mongodb_query"


@pytest.mark.asyncio
async def test_stream_agent_error_event_yields_done_error_and_stops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    conv = _make_conversation()

    async def _fake_stream(**kwargs):
        yield {"code": 429, "message": "Resource exhausted"}

    mock_agent = MagicMock()
    mock_agent.async_stream_query = _fake_stream

    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(USER_ID, conv, "hi")]

    assert len(events) == 1
    assert events[0]["event"] == "done"
    assert json.loads(events[0]["data"])["error"] == "Resource exhausted"
    assert not any(e["event"] == "text_chunk" for e in events)


@pytest.mark.asyncio
async def test_stream_exception_yields_done_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    conv = _make_conversation()

    async def _fake_stream(**kwargs):
        raise Exception("connection reset")
        yield  # marks this as an async generator

    mock_agent = MagicMock()
    mock_agent.async_stream_query = _fake_stream

    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(USER_ID, conv, "hi")]

    assert len(events) == 1
    assert events[0]["event"] == "done"
    assert "error" in json.loads(events[0]["data"])


@pytest.mark.asyncio
async def test_stream_claim_focused_adds_context_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    conv = _make_conversation(mode=ConversationMode.CLAIM_FOCUSED, claim_id=CLAIM_ID)

    captured: dict[str, str] = {}

    async def _fake_stream(**kwargs):
        captured["message"] = kwargs["message"]
        return
        yield  # marks this as an async generator

    mock_agent = MagicMock()
    mock_agent.async_stream_query = _fake_stream

    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        _events = [e async for e in stream_agent_response(USER_ID, conv, "check my claim")]

    assert captured["message"].startswith(f"[Context: claim_id={CLAIM_ID}]")
