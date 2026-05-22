import type {
  ConversationMode,
  ConversationStatus,
  ISODateString,
  MessageRole,
  UUID,
} from "./types";

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output_summary: string;
  at: ISODateString;
}

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  at: ISODateString;
  tool_calls: ToolCall[] | null;
}

export interface Conversation {
  _id: UUID;
  updated_at: ISODateString | null;
  user_id: UUID;
  mode: ConversationMode;
  claim_id: UUID | null;
  title: string;
  messages: ConversationMessage[];
  trace_ids: string[];
  status: ConversationStatus;
  created_at: ISODateString;
  last_message_at: ISODateString;
  archived_at: ISODateString | null;
  agent_session_id?: string | null;
}
