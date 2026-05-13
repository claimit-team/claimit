"""Conversation collection — mirror of Conversation.ts."""

from typing import Any

from pydantic import BaseModel

from .base import BaseDocument
from .enums import ConversationMode, ConversationStatus, MessageRole


class ToolCall(BaseModel):
    tool: str
    input: dict[str, Any]
    output_summary: str
    at: str


class ConversationMessage(BaseModel):
    role: MessageRole
    content: str
    at: str
    tool_calls: list[ToolCall] | None


class Conversation(BaseDocument):
    user_id: str
    mode: ConversationMode
    claim_id: str | None
    title: str
    messages: list[ConversationMessage]
    trace_ids: list[str]
    status: ConversationStatus
    created_at: str
    last_message_at: str
    archived_at: str | None
