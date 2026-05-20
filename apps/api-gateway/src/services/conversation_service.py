"""Business logic for conversation management and Assistant Agent streaming."""

import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import vertexai
import vertexai.agent_engines
from claimit_mongodb_models.client import MongoDBClient
from claimit_mongodb_models.conversation import Conversation, ConversationMessage, ToolCall
from claimit_mongodb_models.enums import ConversationMode, ConversationStatus, MessageRole

logger = logging.getLogger(__name__)

# Resource names are in the form
# `projects/{project}/locations/{location}/reasoningEngines/{id}`.
# We parse project + location from this string to drive vertexai.init()
# — see the comment in stream_agent_response below for why init() is
# load-bearing.
_RESOURCE_NAME_RE = re.compile(
    r"^projects/(?P<project>[^/]+)/locations/(?P<location>[^/]+)/reasoningEngines/"
)


async def create_conversation(
    db: MongoDBClient,
    user_id: UUID,
    mode: ConversationMode,
    claim_id: UUID | None,
) -> Conversation:
    if mode == ConversationMode.CLAIM_FOCUSED and claim_id is None:
        raise ValueError("claim_id is required for claim_focused mode")

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


async def stream_agent_response(
    user_id: UUID,
    conversation: Conversation,
    user_message: str,
) -> AsyncGenerator[dict[str, Any], None]:
    resource_name = os.environ.get("CLAIMIT_ASSISTANT_AGENT_ID")
    if not resource_name:
        yield {"event": "done", "data": json.dumps({"error": "Assistant agent not configured"})}
        return

    if conversation.mode == ConversationMode.CLAIM_FOCUSED and conversation.claim_id:
        prefix = f"[Context: claim_id={conversation.claim_id}] "
    else:
        prefix = ""
    prompt = prefix + user_message

    try:
        # The Vertex AI SDK uses REGIONAL service endpoints — calling
        # agent_engines.get() without prior vertexai.init() defaults to
        # the global / us-central1 endpoint, which has no visibility
        # into us-east1 reasoning engines. The symptom is
        # `google.api_core.exceptions.NotFound: 404 The reasoning engine
        # resource [...] is not found.` for a resource that demonstrably
        # exists when queried with explicit init.
        #
        # Parse project + location from the resource name itself so we
        # don't need GOOGLE_CLOUD_LOCATION as a separate env var, and
        # so deploys never drift apart. vertexai.init() is idempotent;
        # calling it on every request is fine.
        match = _RESOURCE_NAME_RE.match(resource_name)
        if match:
            vertexai.init(project=match["project"], location=match["location"])

        # SDK signature: `get(resource_name: str)` — the kwarg is
        # `resource_name`, not `name`. Passing `name=` raised TypeError on
        # every call, which the surrounding except swallowed into a
        # generic `done` SSE frame; symptomatic in the UI as "every chat
        # message returns an error".
        remote_agent = vertexai.agent_engines.get(resource_name=resource_name)

        collected_text = ""
        collected_tool_calls: list[dict] = []

        async for event in remote_agent.async_stream_query(
            user_id=str(user_id),
            message=prompt,
        ):
            for part in event.get("content", {}).get("parts", []):
                if "text" in part:
                    collected_text += part["text"]
                    yield {
                        "event": "text_chunk",
                        "data": json.dumps({"text": part["text"]}),
                    }

                if "function_call" in part:
                    fc = part["function_call"]
                    tool_event = {"tool": fc.get("name"), "input": fc.get("args", {})}
                    collected_tool_calls.append(tool_event)
                    yield {
                        "event": "tool_call",
                        "data": json.dumps(tool_event),
                    }

                if "function_response" in part:
                    fr = part["function_response"]
                    yield {
                        "event": "tool_result",
                        "data": json.dumps(
                            {
                                "tool": fr.get("name"),
                                "output_summary": str(fr.get("response", ""))[:200],
                            }
                        ),
                    }

            if "code" in event and "message" in event:
                logger.warning(
                    "Agent error event: code=%s message=%s", event["code"], event["message"]
                )
                yield {
                    "event": "done",
                    "data": json.dumps({"error": event["message"]}),
                }
                return

        yield {
            "event": "done",
            "data": json.dumps(
                {
                    "final_message": collected_text,
                    "tool_calls_made": len(collected_tool_calls),
                    "tool_calls": collected_tool_calls,
                }
            ),
        }

    except Exception as e:
        logger.exception("Agent stream error")
        yield {"event": "done", "data": json.dumps({"error": str(e)})}
