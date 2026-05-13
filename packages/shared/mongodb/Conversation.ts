import type { ConversationMode, ConversationStatus, MessageRole } from "./types";

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output_summary: string;
  at: string;
}

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  at: string;
  tool_calls: ToolCall[] | null;
}

export interface Conversation {
  _id: string;
  user_id: string;
  mode: ConversationMode;
  claim_id: string | null;
  title: string;
  messages: ConversationMessage[];
  trace_ids: string[];
  status: ConversationStatus;
  created_at: string;
  last_message_at: string;
  archived_at: string | null;
}
