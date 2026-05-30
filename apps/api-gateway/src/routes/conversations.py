"""Conversation endpoints: CRUD + SSE agent streaming."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.conversation import Conversation, ToolCall
from claimit_mongodb_models.enums import ConversationMode, ConversationStatus, MessageRole
from claimit_mongodb_models.user import User
from fastapi import APIRouter, Depends, HTTPException, Response, status
from opentelemetry import trace as otel_trace
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError
from ..services.conversation_service import (
    append_message,
    create_conversation,
    get_conversation_for_user,
    list_conversations,
    stream_agent_response,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)
_tracer = otel_trace.get_tracer("claimit.api-gateway.conversations")


class CreateConversationRequest(BaseModel):
    mode: ConversationMode
    claim_id: UUID | None = None


class SendMessageRequest(BaseModel):
    content: str


class PatchConversationRequest(BaseModel):
    title: str | None = None
    status: ConversationStatus | None = None


def _accumulate_stream_event(
    event: dict[str, str],
    *,
    collected_text: list[str],
    collected_tool_calls: list[dict],
) -> None:
    event_type = event.get("event")
    data = event.get("data", "")
    if event_type == "text_chunk":
        try:
            parsed = json.loads(data)
            text = parsed.get("text")
            if isinstance(text, str) and text:
                collected_text.append(text)
        except json.JSONDecodeError:
            pass
    elif event_type == "tool_call":
        try:
            parsed = json.loads(data)
            tool = parsed.get("tool")
            if tool:
                collected_tool_calls.append({"tool": tool, "input": parsed.get("input", {}) or {}})
        except json.JSONDecodeError:
            pass


@router.get("")
async def list_conversations_endpoint(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    mode: ConversationMode | None = None,
    conv_status: ConversationStatus | None = None,
    limit: int = 20,
    skip: int = 0,
) -> dict:
    limit = min(limit, 50)
    convs = await list_conversations(db, user.id, mode, conv_status, limit, skip)
    return {
        "conversations": [c.model_dump(mode="json", by_alias=True) for c in convs],
        "count": len(convs),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_conversation_endpoint(
    body: CreateConversationRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict:
    try:
        conv = await create_conversation(db, user.id, body.mode, body.claim_id)
        return {"conversation": conv.model_dump(mode="json", by_alias=True)}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e


@router.patch("/{conversation_id}")
async def patch_conversation_endpoint(
    conversation_id: UUID,
    body: PatchConversationRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict:
    try:
        await get_conversation_for_user(db, conversation_id, user.id)
    except (ValueError, PermissionError):
        raise ApiError(
            "conversation_not_found", "Conversation not found", status_code=404
        ) from None

    updates: dict = {}
    if body.title is not None:
        t = body.title.strip()
        if not t:
            raise ApiError("invalid_title", "Title cannot be empty", status_code=422)
        updates["title"] = t[:200]
    if body.status is not None:
        updates["status"] = body.status.value
        updates["archived_at"] = (
            datetime.now(UTC) if body.status == ConversationStatus.ARCHIVED else None
        )

    if updates:
        matched = await db.partial_update(
            "conversations", conversation_id, updates, model=Conversation
        )
        if not matched:
            raise ApiError("conversation_not_found", "Conversation not found", status_code=404)

    try:
        updated = await get_conversation_for_user(db, conversation_id, user.id)
    except (ValueError, PermissionError):
        raise ApiError(
            "conversation_not_found", "Conversation not found", status_code=404
        ) from None
    return {"conversation": updated.model_dump(mode="json", by_alias=True)}


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation_endpoint(
    conversation_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> Response:
    try:
        await get_conversation_for_user(db, conversation_id, user.id)
    except (ValueError, PermissionError):
        raise ApiError(
            "conversation_not_found", "Conversation not found", status_code=404
        ) from None
    deleted = await db.delete("conversations", conversation_id)
    if not deleted:
        raise ApiError("conversation_not_found", "Conversation not found", status_code=404)
    return Response(status_code=204)


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: UUID,
    body: SendMessageRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> EventSourceResponse:
    # Create a manual span to obtain a valid trace_id. We can't rely on
    # an active request span (FastAPIInstrumentor is not wired), and
    # _current_trace_id() inside a generator always returns None because
    # async generators don't inherit the caller's OTel context.
    # When PHOENIX_API_KEY is unset, init_phoenix() skips registering a
    # TracerProvider, so get_tracer() returns a no-op tracer (trace_id=0).
    _span = _tracer.start_span("conversations.send_message")
    _ctx = _span.get_span_context()
    route_trace_id = format(_ctx.trace_id, "032x") if _ctx.trace_id != 0 else None
    _span.end()

    async def event_generator():
        def _augment_done(ev: dict) -> dict:
            if not route_trace_id:
                return ev
            try:
                payload = json.loads(ev.get("data", "{}"))
                if "trace_id" not in payload:
                    payload["trace_id"] = route_trace_id
                return {"event": "done", "data": json.dumps(payload)}
            except json.JSONDecodeError:
                return ev

        try:
            conv = await get_conversation_for_user(db, conversation_id, user.id)
        except ValueError:
            yield _augment_done(
                {"event": "done", "data": json.dumps({"error": "Conversation not found"})}
            )
            return
        except PermissionError:
            yield _augment_done({"event": "done", "data": json.dumps({"error": "Access denied"})})
            return

        conv = await append_message(db, conv, MessageRole.USER, body.content)

        text_parts: list[str] = []
        raw_tool_calls: list[dict] = []
        done_error: str | None = None
        event: dict | None = None

        agent_stream = stream_agent_response(db, user.id, conv, body.content)

        while True:
            try:
                event = await asyncio.wait_for(agent_stream.__anext__(), timeout=15.0)
                if event.get("event") == "done":
                    event = _augment_done(event)
                yield event
                _accumulate_stream_event(
                    event,
                    collected_text=text_parts,
                    collected_tool_calls=raw_tool_calls,
                )
                if event.get("event") == "done":
                    try:
                        done_payload = json.loads(event.get("data", "{}"))
                        err = done_payload.get("error")
                        if isinstance(err, str) and err:
                            done_error = err
                    except json.JSONDecodeError:
                        pass
                    break
            except StopAsyncIteration:
                break
            except TimeoutError:
                yield {"event": "heartbeat", "data": ""}
                continue
            except Exception as e:
                logger.exception("Stream error in send_message")
                yield _augment_done({"event": "done", "data": json.dumps({"error": str(e)})})
                break

        if done_error:
            return

        assistant_text = "".join(text_parts).strip()
        if not assistant_text and not raw_tool_calls:
            return

        try:
            tool_calls_to_save = [
                ToolCall(
                    tool=tc["tool"],
                    input=tc.get("input", {}),
                    output_summary="",
                    at=datetime.now(UTC),
                )
                for tc in raw_tool_calls
                if tc.get("tool")
            ] or None
            await append_message(
                db,
                conv,
                MessageRole.ASSISTANT,
                assistant_text,
                tool_calls_to_save,
            )
        except Exception:
            logger.exception(
                "Failed to persist assistant reply for conversation %s", conversation_id
            )

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
