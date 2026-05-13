"""Conversation collection — mirror of Conversation.ts."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from .base import BaseDocument
from .enums import ConversationMode, ConversationStatus, MessageRole


class ToolCall(BaseModel):
    tool: str
    input: dict[str, object]
    output_summary: str
    at: datetime


class ConversationMessage(BaseModel):
    role: MessageRole
    content: str
    at: datetime
    tool_calls: list[ToolCall] | None


class Conversation(BaseDocument):
    user_id: UUID
    mode: ConversationMode
    claim_id: UUID | None
    title: str
    messages: list[ConversationMessage]
    trace_ids: list[str]
    status: ConversationStatus
    created_at: datetime
    last_message_at: datetime
    archived_at: datetime | None
