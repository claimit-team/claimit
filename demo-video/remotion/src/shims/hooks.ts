// Mock implementations for the @/hooks/* modules the claim panes
// import. Most are quiet defaults — no fetching, no SSE, no resize
// listeners — but `useAssistantStream` and `useConversations` are
// context-driven so the real AssistantPane shows frame-driven content
// (DP-8 user pill + streaming reply + tool line) during Shot 10.

import { useDemoState } from "../_demo/DemoStateContext";
import { DP8_ASSISTANT } from "../shots/_shared/data";

export function useMediaQuery(_query: string): boolean {
  return true;
}

/**
 * Returns one conversation matching the current claim id with a
 * single (empty) wire message stub. The real AssistantPane then
 * calls `hydrate(wireToUI(existing.messages))` once on that id —
 * but we ignore the hydrate payload (see useAssistantStream below)
 * and source the displayed messages from frame state instead.
 *
 * Returning a non-empty conversations array prevents AssistantPane
 * from entering the "creating new conversation" path which would
 * trigger a network call.
 */
export function useConversations(_args: unknown) {
  const conv = {
    _id: "demo-conv-sony-001",
    user_id: "demo-user-001",
    mode: "claim_focused" as const,
    claim_id: "demo-claim-sony-001",
    title: "Sony — claim focused",
    messages: [] as Array<{
      role: "user" | "assistant";
      content: string;
      at: string;
      tool_calls: unknown[] | null;
    }>,
    status: "active" as const,
    created_at: "2026-05-29T11:34:00Z",
    last_message_at: "2026-05-29T11:34:00Z",
    archived_at: null as string | null,
  };
  return {
    conversations: [conv],
    isLoading: false,
    error: null,
    refetch: async () => {},
    createConversation: async (_mode?: string, _claimId?: string) => conv,
  };
}

/**
 * Drives the AssistantPane's message list from Act III frame state.
 * The pane reads `messages`, `streaming`, `error`, `stalled` and
 * renders the chat thread. `hydrate`/`sendMessage`/`reset`/`abort`
 * are no-ops.
 *
 * Message list rule:
 *  - state.assistantUserBubbleOpacity > 0.05 → push user pill
 *      ("Explain the policy match"). UI doesn't expose per-msg
 *      opacity, so the bubble appears once over the threshold;
 *      Shot 10 ramps it over f60–80 which is hidden by the pane
 *      fading into focus on the same frames.
 *  - state.assistantReplyChars > 0 → push assistant reply with
 *      content = DP8_ASSISTANT.reply.slice(0, replyChars),
 *      streaming = state.assistantStreaming.
 *  - state.assistantToolLineOpacity > 0.05 → attach a tool_call
 *      so the pane renders the "Tools · get_reasoning_trace ·
 *      View trace" line.
 */
export function useAssistantStream(_args?: unknown) {
  const state = useDemoState();
  const messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    at: string;
    streaming?: boolean;
    tool_calls?: Array<{
      tool: string;
      input: Record<string, unknown>;
      output_summary?: string;
    }>;
    trace_id?: string;
    error?: string;
  }> = [];

  if (state.assistantUserBubbleOpacity > 0.05) {
    messages.push({
      id: "demo-msg-user-1",
      role: "user",
      content: DP8_ASSISTANT.userPill,
      at: "2026-05-29T11:34:10Z",
    });
  }

  if (state.assistantReplyChars > 0) {
    const tool_calls =
      state.assistantToolLineOpacity > 0.05
        ? [
            {
              tool: "get_reasoning_trace",
              input: {},
              output_summary: "View trace",
            },
          ]
        : undefined;
    messages.push({
      id: "demo-msg-assistant-1",
      role: "assistant",
      content: DP8_ASSISTANT.reply.slice(0, state.assistantReplyChars),
      at: "2026-05-29T11:34:12Z",
      streaming: state.assistantStreaming,
      tool_calls,
      trace_id: "demo-trace-001",
    });
  }

  return {
    messages,
    streaming: state.assistantStreaming,
    error: null as string | null,
    stalled: false,
    streamingMessage: "",
    isStreaming: state.assistantStreaming,
    sendMessage: async (_a?: unknown, _b?: unknown) => ({
      error: null,
      toolNames: [] as string[],
    }),
    send: async (_: string) => {},
    hydrate: (_: unknown) => {},
    reset: () => {},
    abort: () => {},
  };
}
