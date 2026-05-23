"""Unit tests for conversation_service.py (task 6.5 + session-memory)."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import google.api_core.exceptions
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
    db.partial_update = AsyncMock(return_value=True)
    return db


def _make_conversation(
    user_id: UUID = USER_ID,
    mode: ConversationMode = ConversationMode.GENERAL,
    claim_id: UUID | None = None,
    agent_session_id: str | None = None,
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
        agent_session_id=agent_session_id,
    )


def _mock_agent(stream_fn=None, create_session_id: str | None = "sess-1") -> MagicMock:
    """Build a MagicMock agent with async_stream_query + create_session."""
    agent = MagicMock()
    if stream_fn is not None:
        agent.async_stream_query = stream_fn
    if create_session_id is not None:
        agent.create_session = MagicMock(return_value={"id": create_session_id})
    return agent


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
    # No env var → session creation short-circuits → agent_session_id remains None.
    with patch.dict("os.environ", {}, clear=False):
        import os

        os.environ.pop("CLAIMIT_ASSISTANT_AGENT_ID", None)
        conv = await create_conversation(db, USER_ID, ConversationMode.CLAIM_FOCUSED, CLAIM_ID)
    assert conv.mode == ConversationMode.CLAIM_FOCUSED
    assert conv.claim_id == CLAIM_ID
    assert conv.messages == []
    assert conv.status == ConversationStatus.ACTIVE
    db.upsert_conversation.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_conversation_general_without_claim_id_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CLAIMIT_ASSISTANT_AGENT_ID", raising=False)
    db = _make_db()
    conv = await create_conversation(db, USER_ID, ConversationMode.GENERAL, None)
    assert conv.mode == ConversationMode.GENERAL
    assert conv.claim_id is None
    # No agent configured → session id stays None.
    assert conv.agent_session_id is None


@pytest.mark.asyncio
async def test_create_conversation_persists_agent_session_when_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the agent is configured and create_session works, the new
    conversation should land in MongoDB with the session id set."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    mock_agent = _mock_agent(create_session_id="srv-session-xyz")
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        conv = await create_conversation(db, USER_ID, ConversationMode.GENERAL, None)
    assert conv.agent_session_id == "srv-session-xyz"
    mock_agent.create_session.assert_called_once_with(user_id=str(USER_ID))


@pytest.mark.asyncio
async def test_create_conversation_swallows_session_create_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A Vertex hiccup must not block conversation creation — session id
    stays None and lazy-backfill takes over on first send."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    mock_agent = _mock_agent()
    mock_agent.create_session = MagicMock(side_effect=RuntimeError("vertex hiccup"))
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        conv = await create_conversation(db, USER_ID, ConversationMode.GENERAL, None)
    assert conv.agent_session_id is None
    db.upsert_conversation.assert_awaited_once()


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
# Group 4: stream_agent_response — happy paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_no_agent_env_var_yields_done_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_ASSISTANT_AGENT_ID", raising=False)
    db = _make_db()
    conv = _make_conversation()

    events = [e async for e in stream_agent_response(db, USER_ID, conv, "hello")]

    assert len(events) == 1
    assert events[0]["event"] == "done"
    assert "error" in json.loads(events[0]["data"])


@pytest.mark.asyncio
async def test_stream_text_parts_yield_text_chunk_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="existing-sess")

    async def _fake_stream(**kwargs):
        yield {"partial": True, "content": {"parts": [{"text": "Hello "}]}}
        yield {"partial": True, "content": {"parts": [{"text": "world"}]}}
        yield {"partial": False, "content": {"parts": [{"text": "Hello world"}]}}

    mock_agent = _mock_agent(stream_fn=_fake_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 2
    assert json.loads(text_chunks[0]["data"])["text"] == "Hello "
    assert json.loads(text_chunks[1]["data"])["text"] == "world"

    done_events = [e for e in events if e["event"] == "done"]
    assert len(done_events) == 1
    assert json.loads(done_events[0]["data"]) == {}


@pytest.mark.asyncio
async def test_stream_sse_partial_deltas_no_final_duplicate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="existing-sess")
    captured_kwargs: dict = {}

    async def _fake_stream(**kwargs):
        captured_kwargs.update(kwargs)
        yield {"partial": True, "content": {"parts": [{"text": "A"}]}}
        yield {"partial": True, "content": {"parts": [{"text": "B"}]}}
        yield {"partial": True, "content": {"parts": [{"text": "C"}]}}
        yield {"partial": False, "content": {"parts": [{"text": "ABC"}]}}

    mock_agent = _mock_agent(stream_fn=_fake_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    assert captured_kwargs.get("run_config") == {"streaming_mode": "sse"}
    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 3
    texts = [json.loads(e["data"])["text"] for e in text_chunks]
    assert texts == ["A", "B", "C"]
    assert "ABC" not in texts
    assert "".join(texts) == "ABC"


@pytest.mark.asyncio
async def test_stream_sse_no_partials_fallback_single_chunk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="existing-sess")

    async def _fake_stream(**kwargs):
        yield {"partial": False, "content": {"parts": [{"text": "ABC"}]}}

    mock_agent = _mock_agent(stream_fn=_fake_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 1
    assert json.loads(text_chunks[0]["data"])["text"] == "ABC"


@pytest.mark.asyncio
async def test_stream_function_call_yields_tool_call_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="existing-sess")

    async def _fake_stream(**kwargs):
        yield {
            "content": {
                "parts": [
                    {"function_call": {"name": "mongodb_query", "args": {"collection": "claims"}}}
                ]
            }
        }

    mock_agent = _mock_agent(stream_fn=_fake_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    tool_calls = [e for e in events if e["event"] == "tool_call"]
    assert len(tool_calls) == 1
    assert json.loads(tool_calls[0]["data"])["tool"] == "mongodb_query"


@pytest.mark.asyncio
async def test_stream_function_response_yields_tool_result_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="existing-sess")

    async def _fake_stream(**kwargs):
        yield {
            "content": {
                "parts": [
                    {"function_response": {"name": "mongodb_query", "response": {"data": []}}}
                ]
            }
        }

    mock_agent = _mock_agent(stream_fn=_fake_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    tool_results = [e for e in events if e["event"] == "tool_result"]
    assert len(tool_results) == 1
    assert json.loads(tool_results[0]["data"])["tool"] == "mongodb_query"


@pytest.mark.asyncio
async def test_stream_claim_focused_routes_to_mode_b_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ASSISTANT_AGENT_URL", "https://assistant.example")
    db = _make_db()
    conv = _make_conversation(
        mode=ConversationMode.CLAIM_FOCUSED, claim_id=CLAIM_ID, agent_session_id="sess"
    )

    async def _fake_mode_b(*args, **kwargs):
        yield {"event": "text_chunk", "data": json.dumps({"text": "claim help"})}
        yield {"event": "done", "data": "{}"}

    with (
        patch("src.services.claims_service._load_owned_claim", new_callable=AsyncMock),
        patch(
            "src.services.conversation_service.stream_mode_b_response",
            side_effect=_fake_mode_b,
        ),
        patch("vertexai.agent_engines.get") as mock_get,
    ):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "check my claim")]

    mock_get.assert_not_called()
    assert any(e["event"] == "text_chunk" for e in events)
    texts = [json.loads(e["data"])["text"] for e in events if e["event"] == "text_chunk"]
    assert "claim help" in texts


# ---------------------------------------------------------------------------
# Group 5: session memory (new)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_passes_session_id_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """Existing session id should flow through to async_stream_query so the
    deployed agent picks up multi-turn context."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="my-session-id-42")

    captured: dict[str, Any] = {}

    async def _fake_stream(**kwargs):
        captured.update(kwargs)
        yield {"content": {"parts": [{"text": "ok"}]}}

    mock_agent = _mock_agent(stream_fn=_fake_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        _events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    assert captured.get("session_id") == "my-session-id-42"
    # create_session must NOT be called when one already exists.
    mock_agent.create_session.assert_not_called()


@pytest.mark.asyncio
async def test_stream_lazy_backfill_when_session_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Conversations created before session-memory landed have no
    agent_session_id; the stream path must create + persist one."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id=None)

    captured: dict[str, Any] = {}

    async def _fake_stream(**kwargs):
        captured.update(kwargs)
        yield {"content": {"parts": [{"text": "ok"}]}}

    mock_agent = _mock_agent(stream_fn=_fake_stream, create_session_id="backfilled-sess")
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        _events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    mock_agent.create_session.assert_called_once_with(user_id=str(USER_ID))
    assert captured.get("session_id") == "backfilled-sess"
    # Persisted via partial_update so subsequent turns reuse it.
    db.partial_update.assert_any_call(
        "conversations", CONV_ID, {"agent_session_id": "backfilled-sess"}
    )
    assert conv.agent_session_id == "backfilled-sess"


@pytest.mark.asyncio
async def test_stream_recreates_stale_session_on_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A NotFound from a stale session triggers one recreate + retry."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="stale-session")

    call_count = 0

    async def _fake_stream(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # First call: stale session → NotFound mid-stream.
            raise google.api_core.exceptions.NotFound("session is stale")
            yield  # mark as async generator
        else:
            # Retry: succeeds with the new session.
            yield {"content": {"parts": [{"text": "recovered"}]}}

    mock_agent = _mock_agent(stream_fn=_fake_stream, create_session_id="fresh-session")
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    # create_session was called for the recreate.
    assert mock_agent.create_session.call_count == 1
    # New session persisted.
    db.partial_update.assert_any_call(
        "conversations", CONV_ID, {"agent_session_id": "fresh-session"}
    )
    # Retry produced the text from the second attempt.
    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 1
    assert json.loads(text_chunks[0]["data"])["text"] == "recovered"


@pytest.mark.asyncio
async def test_stream_stops_retrying_after_session_recreate_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the recreated session also returns NotFound, give up and surface
    a friendly error rather than recursing forever."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="stale-1")

    async def _always_not_found(**kwargs):
        raise google.api_core.exceptions.NotFound("session always stale")
        yield

    mock_agent = _mock_agent(stream_fn=_always_not_found, create_session_id="stale-2")
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    # One retry, then surface error.
    assert mock_agent.create_session.call_count == 1
    done = [e for e in events if e["event"] == "done"]
    assert len(done) == 1
    assert "error" in json.loads(done[0]["data"])


# ---------------------------------------------------------------------------
# Group 6: error handling (new)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_empty_response_yields_friendly_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An agent that emits no text/tool parts should produce a friendly
    fallback text chunk rather than a silent empty bubble."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="sess")

    async def _empty_stream(**kwargs):
        return
        yield

    mock_agent = _mock_agent(stream_fn=_empty_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 1
    assert "rephrase" in json.loads(text_chunks[0]["data"])["text"].lower()


@pytest.mark.asyncio
async def test_stream_safety_blocked_finish_reason_yields_friendly_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Gemini reports safety blocks via finish_reason != STOP on a
    content-less event. Surface a non-scary user-facing message."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="sess")

    async def _safety_blocked(**kwargs):
        yield {"content": {"parts": []}, "finish_reason": "SAFETY"}

    mock_agent = _mock_agent(stream_fn=_safety_blocked)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    done = [e for e in events if e["event"] == "done"]
    assert len(done) == 1
    err = json.loads(done[0]["data"])["error"]
    assert "not able to help" in err.lower()


@pytest.mark.asyncio
async def test_stream_partial_response_plus_error_yields_partial_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If text was already streamed before an exception, the done frame
    should acknowledge the partial answer rather than say generic 'try
    again' (which would imply nothing got through)."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="sess")

    async def _crashes_mid_stream(**kwargs):
        yield {"partial": True, "content": {"parts": [{"text": "Here's what I found: "}]}}
        raise RuntimeError("upstream connection reset")

    mock_agent = _mock_agent(stream_fn=_crashes_mid_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 1
    done = [e for e in events if e["event"] == "done"]
    assert len(done) == 1
    err = json.loads(done[0]["data"])["error"]
    assert "partial" in err.lower()


@pytest.mark.asyncio
async def test_stream_clean_exception_with_no_text_yields_generic_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the stream blows up before yielding anything, the error
    message should NOT mention 'partial answer' (there isn't one)."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="sess")

    async def _immediate_crash(**kwargs):
        raise RuntimeError("connection reset")
        yield

    mock_agent = _mock_agent(stream_fn=_immediate_crash)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    done = [e for e in events if e["event"] == "done"]
    assert len(done) == 1
    err = json.loads(done[0]["data"])["error"]
    assert "partial" not in err.lower()


@pytest.mark.asyncio
async def test_stream_agent_get_failure_yields_connectivity_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A 404/network failure inside agent_engines.get should surface as
    a connectivity error, not crash the route."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="sess")

    with patch(
        "vertexai.agent_engines.get",
        side_effect=google.api_core.exceptions.NotFound("agent not found"),
    ):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    done = [e for e in events if e["event"] == "done"]
    assert len(done) == 1
    err = json.loads(done[0]["data"])["error"]
    assert "trouble connecting" in err.lower()


@pytest.mark.asyncio
async def test_stream_session_persist_failure_still_uses_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A Mongo write blip on agent_session_id must NOT throw away the
    session we just successfully created — the current request should
    still stream with memory enabled."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    db.partial_update = AsyncMock(side_effect=RuntimeError("mongo blip"))
    conv = _make_conversation(agent_session_id=None)  # triggers lazy backfill

    captured: dict[str, Any] = {}

    async def _fake_stream(**kwargs):
        captured.update(kwargs)
        yield {"content": {"parts": [{"text": "ok"}]}}

    mock_agent = _mock_agent(stream_fn=_fake_stream, create_session_id="created-but-not-persisted")
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]

    # Session id was passed to the stream despite the persist failure.
    assert captured.get("session_id") == "created-but-not-persisted"
    # And the in-memory conversation has been mutated so the current
    # request's recursive paths (if any) see the new id.
    assert conv.agent_session_id == "created-but-not-persisted"
    # Stream still produced a real response — no error frame.
    text_chunks = [e for e in events if e["event"] == "text_chunk"]
    assert len(text_chunks) == 1
    assert json.loads(text_chunks[0]["data"])["text"] == "ok"


@pytest.mark.asyncio
async def test_stream_total_timeout_aborts_stalled_stream(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A stream that never yields an event must be terminated by the
    wall-clock ceiling, not left to Cloud Run's 300s request timeout."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="sess")

    async def _hanging_stream(**kwargs):
        # Sleep much longer than the patched ceiling — wait_for must
        # fire before this resolves. If wait_for isn't doing its job
        # the test would hang for 5s + pytest's own timeout.
        await asyncio.sleep(5)
        yield  # never reached

    mock_agent = _mock_agent(stream_fn=_hanging_stream)

    with (
        patch("vertexai.agent_engines.get", return_value=mock_agent),
        patch("src.services.conversation_service._MAX_STREAM_SECONDS", 0.1),
    ):
        start = asyncio.get_running_loop().time()
        events = [e async for e in stream_agent_response(db, USER_ID, conv, "hi")]
        elapsed = asyncio.get_running_loop().time() - start

    # Must complete in well under the 5s mock-sleep — the timeout is the
    # only thing that can release us in time.
    assert elapsed < 2.0, f"stream did not abort in time (elapsed={elapsed:.2f}s)"
    done = [e for e in events if e["event"] == "done"]
    assert len(done) == 1
    err = json.loads(done[0]["data"])["error"]
    assert "too long" in err.lower()


@pytest.mark.asyncio
async def test_stream_client_disconnect_propagates_silently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the consumer (route) calls aclose() on our generator mid-stream
    (client disconnect), GeneratorExit must propagate and we must NOT
    yield further frames or treat it as an error."""
    monkeypatch.setenv("CLAIMIT_ASSISTANT_AGENT_ID", "fake-resource-name")
    db = _make_db()
    conv = _make_conversation(agent_session_id="sess")

    async def _long_stream(**kwargs):
        # Yield enough events that we can interrupt before completion.
        for i in range(10):
            yield {"partial": True, "content": {"parts": [{"text": f"chunk-{i} "}]}}

    mock_agent = _mock_agent(stream_fn=_long_stream)
    with patch("vertexai.agent_engines.get", return_value=mock_agent):
        gen = stream_agent_response(db, USER_ID, conv, "hi")
        # Consume one event, then close — simulates client disconnect.
        first = await gen.__anext__()
        assert first["event"] == "text_chunk"
        await gen.aclose()
        # aclose should NOT raise. If GeneratorExit were swallowed and an
        # error frame were yielded after close, the test would fail with
        # `aclose() raised StopIteration` or similar.
