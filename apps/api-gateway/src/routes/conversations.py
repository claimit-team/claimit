"""Conversation endpoints: CRUD + SSE agent streaming."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.conversation import ToolCall
from claimit_mongodb_models.enums import ConversationMode, ConversationStatus, MessageRole
from claimit_mongodb_models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..deps import get_db
from ..middleware.auth import get_current_user
from ..services.conversation_service import (
    append_message,
    create_conversation,
    get_conversation_for_user,
    list_conversations,
    stream_agent_response,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)


class CreateConversationRequest(BaseModel):
    mode: ConversationMode
    claim_id: UUID | None = None


class SendMessageRequest(BaseModel):
    content: str


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


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: UUID,
    body: SendMessageRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> EventSourceResponse:
    async def event_generator():
        try:
            conv = await get_conversation_for_user(db, conversation_id, user.id)
        except ValueError:
            yield {"event": "done", "data": json.dumps({"error": "Conversation not found"})}
            return
        except PermissionError:
            yield {"event": "done", "data": json.dumps({"error": "Access denied"})}
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
                yield {"event": "done", "data": json.dumps({"error": str(e)})}
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

    return EventSourceResponse(event_generator())
