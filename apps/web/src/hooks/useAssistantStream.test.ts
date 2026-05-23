import { describe, expect, it } from "vitest";

import type { UIMessage } from "@/types/assistant";

const EMPTY_FALLBACK = "fallback message";

function settlePendingToolCalls(prev: UIMessage[], id: string): UIMessage[] {
  return prev.map((m) => {
    if (m.id !== id || !m.tool_calls?.length) return m;
    const nextCalls = m.tool_calls.map((tc) =>
      tc.output_summary === undefined ? { ...tc, output_summary: "unavailable" } : tc,
    );
    return { ...m, tool_calls: nextCalls };
  });
}

function finalizeAssistantTurn(prev: UIMessage[], id: string, emptyFallback: string): UIMessage[] {
  return prev.map((m) => {
    if (m.id !== id) return m;
    const settledCalls =
      m.tool_calls?.map((tc) =>
        tc.output_summary === undefined ? { ...tc, output_summary: "unavailable" } : tc,
      ) ?? m.tool_calls;
    const content = m.content.trim().length > 0 ? m.content : emptyFallback;
    return { ...m, streaming: false, content, tool_calls: settledCalls };
  });
}

describe("assistant stream turn finalization", () => {
  it("settles pending tool calls on done", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: "",
        at: "2026-01-01T00:00:00Z",
        streaming: true,
        tool_calls: [{ tool: "get_reasoning_trace", input: {} }],
      },
    ];

    const next = finalizeAssistantTurn(messages, "a1", EMPTY_FALLBACK);

    expect(next[0]?.streaming).toBe(false);
    expect(next[0]?.tool_calls?.[0]?.output_summary).toBe("unavailable");
    expect(next[0]?.content).toBe(EMPTY_FALLBACK);
  });

  it("preserves non-empty assistant content", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: "Here is the answer.",
        at: "2026-01-01T00:00:00Z",
        streaming: true,
        tool_calls: [{ tool: "get_claim_context", input: {}, output_summary: "ok" }],
      },
    ];

    const next = finalizeAssistantTurn(messages, "a1", EMPTY_FALLBACK);

    expect(next[0]?.content).toBe("Here is the answer.");
  });

  it("settlePendingToolCalls fills only undefined summaries", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: "",
        at: "2026-01-01T00:00:00Z",
        tool_calls: [
          { tool: "get_reasoning_trace", input: {}, output_summary: "done" },
          { tool: "get_claim_context", input: {} },
        ],
      },
    ];

    const next = settlePendingToolCalls(messages, "a1");

    expect(next[0]?.tool_calls?.[0]?.output_summary).toBe("done");
    expect(next[0]?.tool_calls?.[1]?.output_summary).toBe("unavailable");
  });
});
