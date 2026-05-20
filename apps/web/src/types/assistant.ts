/**
 * Frontend types for the Assistant feature (ticket 5.10).
 *
 * Where the wire format differs from the MongoDB document model, this
 * file pins the wire shape — domain types in `@claimit/mongodb-types`
 * stay authoritative for storage.
 */

export type SSEEventType = "text_chunk" | "tool_call" | "tool_result" | "done";

/**
 * A raw SSE frame as emitted by the api-gateway's
 * POST /api/v1/conversations/{id}/messages endpoint.
 * `data` is a JSON-encoded string whose shape depends on `event`.
 */
export interface SSEEvent {
  event: SSEEventType;
  data: string;
}

/**
 * Output of a proactive prompt template (mirrors apps/assistant-agent's
 * proactive_prompts.ProactiveOutput dataclass — keep field names in sync).
 *
 * Generated client-side from a NotificationEvent payload so the Floating
 * Panel can auto-open with structured content. No Gemini round-trip
 * involved; these are deterministic string templates.
 */
export interface ProactiveOutput {
  opening_message: string;
  key_facts: string[];
  quick_actions: ProactiveQuickAction[];
}

export interface ProactiveQuickAction {
  label: string;
  action: string;
}

/**
 * In-memory representation of a conversation message rendered by the UI.
 * Distinct from the MongoDB ConversationMessage document because the
 * UI synthesizes streaming messages from SSE frames before any document
 * is written (the assistant message exists locally for the duration of
 * the stream, then is persisted server-side and re-fetched).
 */
export interface UIMessage {
  /** Stable local id — server messages don't carry one. */
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  /** Populated as `tool_call` / `tool_result` frames stream in. */
  tool_calls?: UIToolCall[];
  /** True while the assistant is mid-stream; false once `done` arrives. */
  streaming?: boolean;
  /** Set when the stream errored out — UI renders a retry affordance. */
  error?: string;
}

export interface UIToolCall {
  tool: string;
  input: Record<string, unknown>;
  /** Filled in when the matching tool_result frame arrives. */
  output_summary?: string;
}

/**
 * Conversation list-page payload from GET /api/v1/conversations.
 * (Mirrors api-gateway conversations route + claimit_mongodb_models.Conversation.)
 */
export interface Conversation {
  _id: string;
  user_id: string;
  mode: "general" | "claim_focused";
  claim_id: string | null;
  title: string;
  messages: WireConversationMessage[];
  status: "active" | "archived";
  created_at: string;
  last_message_at: string;
  archived_at: string | null;
}

/** Server-persisted message shape on the wire. */
export interface WireConversationMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
  tool_calls: WireToolCall[] | null;
}

export interface WireToolCall {
  tool: string;
  input: Record<string, unknown>;
  output_summary: string;
  at: string;
}

export type ConversationMode = "general" | "claim_focused";
