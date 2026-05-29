"""Business logic for conversation management and Assistant Agent streaming."""

import asyncio
import json
import logging
import os
import re
import time
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import google.api_core.exceptions
import vertexai
import vertexai.agent_engines
from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.conversation import Conversation, ConversationMessage, ToolCall
from claimit_mongodb_models.enums import ConversationMode, ConversationStatus, MessageRole

from ..middleware.errors import ApiError
from .claims_service import _load_owned_claim
from .mode_b_client import stream_mode_b_response

logger = logging.getLogger(__name__)


def _current_trace_id() -> str | None:
    """Return the hex trace-id from the active OTel span, or None."""
    try:
        from opentelemetry import trace

        ctx = trace.get_current_span().get_span_context()
        if ctx and ctx.trace_id:
            return format(ctx.trace_id, "032x")
    except Exception:
        pass
    return None


# Resource names are in the form
# `projects/{project}/locations/{location}/reasoningEngines/{id}`.
# We parse project + location from this string to drive vertexai.init()
# — the SDK uses regional endpoints and defaults to global / us-central1
# without explicit init, returning 404 for us-east1 resources.
_RESOURCE_NAME_RE = re.compile(
    r"^projects/(?P<project>[^/]+)/locations/(?P<location>[^/]+)/reasoningEngines/"
)

# Wall-clock ceiling on a single agent stream. Cloud Run's request budget
# is 300s, so 120s leaves headroom for the SSE response to drain to the
# client. The per-event 15s heartbeat at the route layer keeps the
# connection alive even when the agent is slow within this window.
_MAX_STREAM_SECONDS = 120

# Bounds session-stale recovery. If the second attempt also gets NotFound,
# something deeper is wrong (agent fully redeployed, IAM revoked, etc.)
# and we surface the error rather than recursing forever.
_SESSION_RETRY_LIMIT = 1


async def create_conversation(
    db: MongoDBClient,
    user_id: UUID,
    mode: ConversationMode,
    claim_id: UUID | None,
) -> Conversation:
    if mode == ConversationMode.CLAIM_FOCUSED and claim_id is None:
        raise ValueError("claim_id is required for claim_focused mode")

    agent_session_id = await _try_create_agent_session(user_id)

    conv = Conversation(
        id=uuid4(),
        user_id=user_id,
        mode=mode,
        claim_id=claim_id,
        title="New Conversation",
        messages=[],
        trace_ids=[],
        status=ConversationStatus.ACTIVE,
        created_at=datetime.now(UTC),
        last_message_at=datetime.now(UTC),
        archived_at=None,
        agent_session_id=agent_session_id,
    )
    await db.upsert_conversation(conv)
    return conv


async def list_conversations(
    db: MongoDBClient,
    user_id: UUID,
    mode: ConversationMode | None,
    status: ConversationStatus | None,
    limit: int,
    skip: int,
) -> list[Conversation]:
    filter_dict: dict[str, Any] = {"user_id": user_id}
    if mode is not None:
        filter_dict["mode"] = mode.value
    if status is not None:
        filter_dict["status"] = status.value
    return await db.find_many("conversations", filter_dict, Conversation, limit=limit, skip=skip)


async def get_conversation_for_user(
    db: MongoDBClient,
    conversation_id: UUID,
    user_id: UUID,
) -> Conversation:
    conv = await db.get_conversation(conversation_id)
    if conv is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    if conv.user_id != user_id:
        raise PermissionError("Not your conversation")
    return conv


async def append_message(
    db: MongoDBClient,
    conv: Conversation,
    role: MessageRole,
    content: str,
    tool_calls: list[ToolCall] | None = None,
) -> Conversation:
    msg = ConversationMessage(
        role=role,
        content=content,
        at=datetime.now(UTC),
        tool_calls=tool_calls,
    )
    conv.messages.append(msg)
    conv.last_message_at = datetime.now(UTC)
    await db.upsert_conversation(conv)
    return conv


# ---------------------------------------------------------------------------
# Agent stream
# ---------------------------------------------------------------------------


def _init_vertexai_from_resource_name(resource_name: str) -> None:
    """Parse project + location from the resource name and init the SDK.

    vertexai.init() is idempotent so per-call invocation is fine. If the
    resource name is malformed (doesn't match the expected shape), skip
    init and let the downstream call fail with its own error — better
    than crashing here with a regex mismatch.
    """
    match = _RESOURCE_NAME_RE.match(resource_name)
    if match:
        vertexai.init(project=match["project"], location=match["location"])
    else:
        logger.warning("Could not parse project/location from resource_name: %s", resource_name)


async def _try_create_agent_session(user_id: UUID) -> str | None:
    """Best-effort agent-session creation at conversation-create time.

    Returns the new session id, or None if the SDK call failed for any
    reason (no agent configured, network blip, IAM issue). On None,
    `stream_agent_response` will lazy-backfill on the first send.
    Persistence to MongoDB happens in the caller via the returned id.
    """
    resource_name = os.environ.get("CLAIMIT_ASSISTANT_AGENT_ID")
    if not resource_name:
        return None
    try:
        _init_vertexai_from_resource_name(resource_name)
        remote_agent = vertexai.agent_engines.get(resource_name=resource_name)
        session = remote_agent.create_session(user_id=str(user_id))
        return session["id"]
    except Exception:
        # Don't let a Vertex-side hiccup block conversation creation.
        # Lazy backfill on first send is the safety net.
        logger.warning("Failed to create agent session at conversation-create time", exc_info=True)
        return None


async def _ensure_agent_and_session(
    db: MongoDBClient,
    conversation: Conversation,
    user_id: UUID,
) -> tuple[Any, str | None]:
    """Return (remote_agent, session_id) for an active stream.

    Raises ValueError when the agent isn't configured at all (env var
    missing). Other exceptions (network, 404 on get(), IAM) bubble up so
    the caller can render a connectivity-failure message.

    Lazy backfill: if the conversation has no agent_session_id (created
    before this feature shipped, or the create-time attempt failed),
    create a session and persist the id so subsequent turns reuse it.
    """
    resource_name = os.environ.get("CLAIMIT_ASSISTANT_AGENT_ID")
    if not resource_name:
        raise ValueError("Assistant agent not configured")

    _init_vertexai_from_resource_name(resource_name)
    remote_agent = vertexai.agent_engines.get(resource_name=resource_name)

    session_id = conversation.agent_session_id
    if session_id is None:
        # Two independent failure modes — keep them in separate try blocks
        # so a transient Mongo write blip doesn't throw away a session we
        # just successfully created on Vertex's side (we'd then proceed
        # without memory and leak a server-side session).
        try:
            session = remote_agent.create_session(user_id=str(user_id))
            session_id = session["id"]
            # Mirror onto the in-memory model FIRST so the current request
            # uses the new id regardless of whether persistence succeeds.
            conversation.agent_session_id = session_id
        except Exception:
            logger.warning(
                "Failed to create agent session, proceeding without memory", exc_info=True
            )
            session_id = None

        if session_id is not None:
            try:
                await db.partial_update(
                    "conversations",
                    conversation.id,
                    {"agent_session_id": session_id},
                )
            except Exception:
                # Persistence failed but we still have a valid session_id
                # in memory — use it for this request. Next turn will
                # see agent_session_id=None on disk and re-create, which
                # is wasteful but correct. Don't null out session_id.
                logger.warning(
                    "Failed to persist new agent_session_id (using in-memory only)",
                    exc_info=True,
                )

    return remote_agent, session_id


def _extract_parts(event: Any) -> list[dict[str, Any]]:
    """Pull the `parts` list out of an event, tolerant of dict or object."""
    content = event.get("content") if isinstance(event, dict) else getattr(event, "content", None)
    if content is None:
        return []
    if isinstance(content, dict):
        return content.get("parts", []) or []
    return getattr(content, "parts", []) or []


def _part_to_dict(part: Any) -> dict[str, Any]:
    """Coerce a part (dict or proto-shaped object) to a dict for inspection."""
    if isinstance(part, dict):
        return part
    if hasattr(type(part), "to_dict"):
        try:
            return type(part).to_dict(part)
        except Exception:
            pass
    # Best-effort: introspect common attributes.
    out: dict[str, Any] = {}
    for key in ("text", "function_call", "function_response"):
        val = getattr(part, key, None)
        if val is not None:
            out[key] = val
    return out


def _finish_reason_is_safe(event: Any) -> bool:
    """True if event has no finish_reason OR it's a normal STOP.

    Gemini reports safety / recitation blocks via finish_reason. STOP is
    the only happy completion value; everything else (SAFETY, RECITATION,
    MAX_TOKENS, OTHER) is a degraded / blocked response.
    """
    finish = (
        event.get("finish_reason")
        if isinstance(event, dict)
        else getattr(event, "finish_reason", None)
    )
    if finish is None:
        return True
    finish_str = str(finish)
    return finish_str in ("STOP", "0", "FinishReason.STOP")


async def stream_agent_response(
    db: MongoDBClient,
    user_id: UUID,
    conversation: Conversation,
    user_message: str,
    *,
    _retry_count: int = 0,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream Gemini's response to `user_message` as SSE-shaped event dicts.

    Yields one of:
      - {"event": "text_chunk",   "data": '{"text": "..."}'}
      - {"event": "tool_call",    "data": '{"tool": "...", "input": {...}}'}
      - {"event": "tool_result",  "data": '{"tool": "...", "output_summary": "..."}'}
      - {"event": "done",         "data": '{}' | '{"error": "..."}'}

    Multi-turn memory: passes `session_id` to the agent if the conversation
    has one, so the model sees prior turns. Lazy-creates a session for
    pre-feature conversations. On a NotFound from a stale session, retries
    once with a fresh session (bounded by `_SESSION_RETRY_LIMIT`).
    """

    if conversation.mode == ConversationMode.CLAIM_FOCUSED:
        if conversation.claim_id is None:
            yield {
                "event": "done",
                "data": json.dumps({"error": "This conversation is missing a claim context."}),
            }
            return
        try:
            await _load_owned_claim(db, conversation.claim_id, user_id)
        except ApiError:
            yield {
                "event": "done",
                "data": json.dumps({"error": "Claim not found or access denied."}),
            }
            return

        # Prior turns only — the current user message was appended by the route.
        history = list(conversation.messages[:-1]) if conversation.messages else []
        async for frame in stream_mode_b_response(
            user_id,
            conversation.claim_id,
            user_message,
            history,
        ):
            if frame.get("event") == "done":
                try:
                    payload = json.loads(frame.get("data", "{}"))
                except json.JSONDecodeError:
                    payload = {}
                tid = _current_trace_id()
                if tid and "trace_id" not in payload:
                    payload["trace_id"] = tid
                yield {"event": "done", "data": json.dumps(payload)}
            else:
                yield frame
        return

    # -------- Phase 1: setup (Mode A / general) --------
    try:
        remote_agent, session_id = await _ensure_agent_and_session(db, conversation, user_id)
    except ValueError as e:
        # Agent not configured at all.
        logger.error("Agent setup failed: %s", e)
        yield {
            "event": "done",
            "data": json.dumps({"error": "I'm temporarily unavailable. Please try again later."}),
        }
        return
    except Exception:
        # get() failed (404 / 403 / network / etc.) — surface a generic
        # connectivity error rather than the raw exception text.
        logger.error("Agent connection failed", exc_info=True)
        yield {
            "event": "done",
            "data": json.dumps(
                {"error": "I'm having trouble connecting. Please try again in a moment."}
            ),
        }
        return

    # -------- Phase 2: build prompt (general / Vertex) --------
    prompt = user_message

    stream_kwargs: dict[str, Any] = {"user_id": str(user_id), "message": prompt}
    if session_id:
        stream_kwargs["session_id"] = session_id
    stream_kwargs["run_config"] = {"streaming_mode": "sse"}

    collected_text = ""
    final_text = ""
    collected_tool_calls: list[dict[str, Any]] = []
    stream_started_at = time.monotonic()

    # -------- Phase 3: stream --------
    # Active wall-clock timeout via asyncio.wait_for on each __anext__()
    # — a passive elapsed-check inside `async for` only fires when events
    # arrive, leaving stalled streams (no events at all) to hang until
    # Cloud Run's 300s request timeout. The wait_for bound is recomputed
    # each iteration so total wall-clock time across the stream is
    # bounded by _MAX_STREAM_SECONDS regardless of event arrival pattern.
    try:
        stream_iter = remote_agent.async_stream_query(**stream_kwargs).__aiter__()
        while True:
            elapsed = time.monotonic() - stream_started_at
            remaining = _MAX_STREAM_SECONDS - elapsed
            if remaining <= 0:
                logger.warning("Stream exceeded %ds ceiling", _MAX_STREAM_SECONDS)
                yield {
                    "event": "done",
                    "data": json.dumps(
                        {"error": "I'm taking too long to respond. Please try again."}
                    ),
                }
                return

            try:
                event = await asyncio.wait_for(stream_iter.__anext__(), timeout=remaining)
            except StopAsyncIteration:
                # Iterator exhausted — normal completion path.
                break
            except TimeoutError:
                logger.warning("Stream stalled past %ds ceiling", _MAX_STREAM_SECONDS)
                yield {
                    "event": "done",
                    "data": json.dumps(
                        {"error": "I'm taking too long to respond. Please try again."}
                    ),
                }
                return

            # Per-event try/except — a single malformed event must not tear
            # down the whole stream when subsequent events may be fine.
            try:
                parts = _extract_parts(event)
                if not parts:
                    # No content parts — check whether this is a safety-blocked
                    # completion (Gemini reports those via finish_reason).
                    if not _finish_reason_is_safe(event):
                        yield {
                            "event": "done",
                            "data": json.dumps(
                                {
                                    "error": (
                                        "I'm not able to help with that particular request. "
                                        "Is there something else I can assist with?"
                                    )
                                }
                            ),
                        }
                        return
                    continue

                is_partial = (
                    bool(event.get("partial"))
                    if isinstance(event, dict)
                    else bool(getattr(event, "partial", False))
                )

                for part in parts:
                    p = _part_to_dict(part)
                    text = p.get("text")
                    if text:
                        if is_partial:
                            collected_text += text
                            yield {"event": "text_chunk", "data": json.dumps({"text": text})}
                        else:
                            final_text = text
                        continue
                    fc = p.get("function_call")
                    if fc is not None:
                        fc_dict = fc if isinstance(fc, dict) else _part_to_dict(fc)
                        tool_entry = {
                            "tool": fc_dict.get("name", "") or "",
                            "input": dict(fc_dict.get("args", {}) or {}),
                        }
                        collected_tool_calls.append(tool_entry)
                        yield {"event": "tool_call", "data": json.dumps(tool_entry)}
                        continue
                    fr = p.get("function_response")
                    if fr is not None:
                        fr_dict = fr if isinstance(fr, dict) else _part_to_dict(fr)
                        yield {
                            "event": "tool_result",
                            "data": json.dumps(
                                {
                                    "tool": fr_dict.get("name", "") or "",
                                    "output_summary": str(fr_dict.get("response", ""))[:200],
                                }
                            ),
                        }
            except Exception:
                # Per-event parse error — log and skip, the next event may
                # still be valid (especially mid-tool-call sequences).
                logger.warning("Failed to parse stream event", exc_info=True)
                continue

        # Stream ended normally.
        if not collected_text and final_text:
            collected_text = final_text
            yield {"event": "text_chunk", "data": json.dumps({"text": final_text})}
        if not (collected_text or final_text).strip() and not collected_tool_calls:
            # Empty response — avoid the dreaded silent assistant bubble.
            fallback = "I wasn't able to generate a response. Could you rephrase your question?"
            yield {"event": "text_chunk", "data": json.dumps({"text": fallback})}
        done_payload: dict[str, Any] = {}
        tid = _current_trace_id()
        if tid:
            done_payload["trace_id"] = tid
        yield {"event": "done", "data": json.dumps(done_payload)}

    except google.api_core.exceptions.NotFound:
        # Almost always a stale session_id (agent redeployed between
        # session-create and this query). Recreate once and retry.
        if _retry_count < _SESSION_RETRY_LIMIT and session_id is not None:
            logger.warning(
                "Session %s stale for conversation %s; recreating", session_id, conversation.id
            )

            # Separate create vs persist so a Mongo blip doesn't throw
            # away a recreated session and force us to surface a generic
            # "lost my train of thought" — recovery should be possible
            # whenever Vertex side is healthy.
            new_sid: str | None = None
            try:
                new_session = remote_agent.create_session(user_id=str(user_id))
                new_sid = new_session["id"]
                conversation.agent_session_id = new_sid
            except Exception:
                logger.exception("Failed to recreate stale session")
                yield {
                    "event": "done",
                    "data": json.dumps(
                        {"error": "I lost my train of thought. Could you repeat that?"}
                    ),
                }
                return

            try:
                await db.partial_update(
                    "conversations",
                    conversation.id,
                    {"agent_session_id": new_sid},
                )
            except Exception:
                logger.warning(
                    "Failed to persist recreated session id (using in-memory only)",
                    exc_info=True,
                )

            async for frame in stream_agent_response(
                db,
                user_id,
                conversation,
                user_message,
                _retry_count=_retry_count + 1,
            ):
                yield frame
            return
        yield {
            "event": "done",
            "data": json.dumps(
                {"error": "I'm having trouble connecting. Please try again in a moment."}
            ),
        }

    except TimeoutError:
        yield {
            "event": "done",
            "data": json.dumps({"error": "I'm taking too long to respond. Please try again."}),
        }

    except GeneratorExit:
        # Client disconnected mid-stream. Normal lifecycle — don't log
        # as error, don't yield (the consumer is gone). Must re-raise so
        # the generator finalizes properly.
        logger.debug("Client disconnected during stream")
        raise

    except Exception:
        logger.error("Unexpected stream error", exc_info=True)
        if collected_text or final_text or collected_tool_calls:
            yield {
                "event": "done",
                "data": json.dumps(
                    {
                        "error": (
                            "I encountered an issue while responding. The partial "
                            "answer above may be incomplete."
                        )
                    }
                ),
            }
        else:
            yield {
                "event": "done",
                "data": json.dumps({"error": "Something went wrong. Please try again."}),
            }
