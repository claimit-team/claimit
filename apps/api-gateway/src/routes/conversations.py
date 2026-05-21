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

        collected_text = ""
        # db is passed so the service can lazy-backfill agent_session_id
        # via partial_update when a pre-feature conversation streams.
        agent_stream = stream_agent_response(db, user.id, conv, body.content)

        while True:
            try:
                event = await asyncio.wait_for(agent_stream.__anext__(), timeout=15.0)
                yield event
                if event.get("event") == "done":
                    collected_text = json.loads(event["data"]).get("final_message", "")
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

        if collected_text:
            try:
                done_payload = json.loads(event["data"]) if event.get("event") == "done" else {}
                raw_tool_calls = done_payload.get("tool_calls", [])
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
                    db, conv, MessageRole.ASSISTANT, collected_text, tool_calls_to_save
                )
            except Exception:
                logger.exception(
                    "Failed to persist assistant reply for conversation %s", conversation_id
                )

    return EventSourceResponse(event_generator())
