/**
 * useAssistantStream — drives chat send via the api-gateway's POST SSE.
 *
 * Why fetch + ReadableStream and not EventSource:
 * The chat endpoint is POST /api/v1/conversations/{id}/messages with a
 * JSON body. EventSource is GET-only and cannot carry bodies or custom
 * headers, so we use fetch() and parse the response body as an SSE
 * stream ourselves. This is the documented browser pattern for
 * bidirectional-trigger SSE.
 *
 * The frame parser handles:
 * - Multi-chunk frames (a single `event:` / `data:` block may arrive
 *   split across multiple network reads).
 * - Heartbeat / comment lines (lines beginning with `:`) — ignored.
 * - Unknown event types — fall through to `unknown` so a future
 *   backend addition doesn't crash the stream.
 *
 * Lifecycle: AbortController is created per sendMessage call and
 * exposed via cancel(). Component unmount also aborts.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { friendlyMessage } from "@/lib/api/errors";
import { auth } from "@/lib/firebase";
import type { UIMessage, UIToolCall } from "@/types/assistant";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
/** 3× the server's 15s heartbeat interval (conversations route). */
const STREAM_STALL_MS = 45_000;
const EMPTY_ASSISTANT_FALLBACK =
  "I couldn't load full details right now. Check the claim record above or try again in a moment.";
const REDRAFT_ASSISTANT_FALLBACK = "Queued — regenerating your draft…";

function emptyFallbackForTools(toolNames: string[]): string {
  return toolNames.includes("request_redraft")
    ? REDRAFT_ASSISTANT_FALLBACK
    : EMPTY_ASSISTANT_FALLBACK;
}

type SendMessageResult = {
  toolNames: string[];
  error?: string;
};

type UseAssistantStreamResult = {
  /** Final + in-progress messages, in chronological order. */
  messages: UIMessage[];
  /** Convenience: true while a sendMessage is mid-stream. */
  streaming: boolean;
  /** Last error (network, auth, broker). Cleared on next sendMessage. */
  error: string | null;
  sendMessage: (conversationId: string, content: string) => Promise<SendMessageResult | undefined>;
  /** Aborts the in-flight stream if any. */
  cancel: () => void;
  /** Wipes the local message buffer — call when switching conversations. */
  reset: () => void;
  /** True when the current stream has stalled waiting for server frames. */
  stalled: boolean;
  /**
   * Pre-populate the buffer with server-persisted messages (e.g. when
   * the user picks an existing conversation from history).
   */
  hydrate: (messages: UIMessage[]) => void;
};

export function useAssistantStream(): UseAssistantStreamResult {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const hydrate = useCallback((seed: UIMessage[]) => {
    setMessages(seed);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  // Unmount cleanup — kill any in-flight stream so dangling readers
  // don't try to setState after the component is gone.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (conversationId: string, content: string): Promise<SendMessageResult | undefined> => {
      if (!API_BASE_URL) {
        setError("NEXT_PUBLIC_API_BASE_URL is not configured.");
        return { toolNames: [], error: "NEXT_PUBLIC_API_BASE_URL is not configured." };
      }
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("User must be signed in.");
        return { toolNames: [], error: "User must be signed in." };
      }

      // Any previous in-flight request gets cancelled when a new send
      // starts — UI semantics: one send at a time per hook instance.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: UIMessage = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `u-${Date.now()}`,
        role: "user",
        content,
        at: new Date().toISOString(),
      };
      const assistantId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `a-${Date.now()}`;
      const assistantPlaceholder: UIMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        at: new Date().toISOString(),
        streaming: true,
      };
      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setStreaming(true);
      setStalled(false);
      setError(null);

      const turnToolNames: string[] = [];
      let turnError: string | undefined;

      let token: string;
      try {
        token = await currentUser.getIdToken();
      } catch {
        setError("Failed to load auth token.");
        setStreaming(false);
        markAssistantError(setMessages, assistantId, "auth failed");
        return { toolNames: [], error: "Failed to load auth token." };
      }

      let response: Response;
      try {
        response = await fetch(
          `${API_BASE_URL}/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({ content }),
            signal: controller.signal,
          },
        );
      } catch (_e) {
        if (controller.signal.aborted) {
          // Caller-initiated cancellation; not an error.
          markAssistantError(setMessages, assistantId, "cancelled");
          setStreaming(false);
          return { toolNames: turnToolNames, error: "cancelled" };
        }
        const networkMsg = friendlyMessage(0, "network_error");
        setError(networkMsg);
        markAssistantError(setMessages, assistantId, "network failed");
        setStreaming(false);
        return {
          toolNames: turnToolNames,
          error: networkMsg,
        };
      }

      if (!response.ok) {
        const errorMsg = friendlyMessage(response.status);
        setError(errorMsg);
        // Both surfaces (page-level error banner + per-message bubble
        // footer) show the same detailed message — the bubble used to
        // show a bare `HTTP 422` which was less useful than the body
        // we already extracted above.
        markAssistantError(setMessages, assistantId, errorMsg);
        setStreaming(false);
        return { toolNames: turnToolNames, error: errorMsg };
      }
      if (!response.body) {
        setError("Stream response had no body.");
        markAssistantError(setMessages, assistantId, "no response body");
        setStreaming(false);
        return { toolNames: turnToolNames, error: "Stream response had no body." };
      }

      try {
        await readSSEStream(response.body, controller.signal, {
          stallMs: STREAM_STALL_MS,
          onStall: () => {
            setStalled(true);
            setMessages((prev) =>
              finalizeAssistantTurn(prev, assistantId, emptyFallbackForTools(turnToolNames)),
            );
          },
          onActivity: () => setStalled(false),
          onHeartbeat: () => setStalled(false),
          onTextChunk: (chunk) => {
            setMessages((prev) => appendToAssistant(prev, assistantId, chunk));
          },
          onToolCall: (call) => {
            turnToolNames.push(call.tool);
            setMessages((prev) => addToolCallToAssistant(prev, assistantId, call));
          },
          onToolResult: (toolName, summary) => {
            setMessages((prev) => addToolResultToAssistant(prev, assistantId, toolName, summary));
          },
          onDone: (errorMsg) => {
            if (errorMsg) {
              turnError = errorMsg;
              setError(errorMsg);
              markAssistantError(setMessages, assistantId, errorMsg);
              setMessages((prev) => settlePendingToolCalls(prev, assistantId));
            } else {
              setMessages((prev) =>
                finalizeAssistantTurn(prev, assistantId, emptyFallbackForTools(turnToolNames)),
              );
            }
          },
          onUnknown: () => {
            // Forward-compatibility: unknown event types are ignored.
          },
        });
      } catch (e) {
        if (controller.signal.aborted) {
          markAssistantError(setMessages, assistantId, "cancelled");
        } else {
          setError(e instanceof Error ? e.message : "Stream parse error");
          markAssistantError(setMessages, assistantId, "stream error");
        }
        setMessages((prev) => settlePendingToolCalls(prev, assistantId));
      } finally {
        setStreaming(false);
        setStalled(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }

      return { toolNames: turnToolNames, error: turnError };
    },
    [],
  );

  return { messages, streaming, stalled, error, sendMessage, cancel, reset, hydrate };
}

// ---------------------------------------------------------------------------
// SSE frame parser — straight Web Streams API + TextDecoder.
// ---------------------------------------------------------------------------

interface FrameHandlers {
  onTextChunk: (chunk: string) => void;
  onToolCall: (call: { tool: string; input: Record<string, unknown> }) => void;
  onToolResult: (tool: string, output_summary: string) => void;
  onDone: (errorMsg?: string) => void;
  onUnknown: (eventType: string, data: string) => void;
  onHeartbeat?: () => void;
  onStall?: () => void;
  onActivity?: () => void;
  stallMs?: number;
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  handlers: FrameHandlers,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const clearStallTimer = () => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  const armStallTimer = () => {
    clearStallTimer();
    if (!handlers.stallMs || !handlers.onStall) return;
    stallTimer = setTimeout(() => {
      handlers.onStall?.();
    }, handlers.stallMs);
  };

  const noteActivity = () => {
    handlers.onActivity?.();
    armStallTimer();
  };

  armStallTimer();

  try {
    while (true) {
      if (signal.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const frameEnd = findFrameEnd(buffer);
        if (frameEnd === -1) break;
        const frameRaw = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + frameTerminatorLength(buffer, frameEnd));
        noteActivity();
        const terminal = dispatchFrame(frameRaw, handlers);
        if (terminal) return;
      }
    }
  } finally {
    clearStallTimer();
    reader.releaseLock();
  }
}

function findFrameEnd(buffer: string): number {
  const a = buffer.indexOf("\r\n\r\n");
  const b = buffer.indexOf("\n\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function frameTerminatorLength(buffer: string, frameEnd: number): number {
  // 4 for \r\n\r\n, 2 for \n\n.
  return buffer.startsWith("\r\n\r\n", frameEnd) ? 4 : 2;
}

/**
 * Returns `true` iff the frame was a terminal `done` event. The caller
 * uses this signal to break out of the read loop so any subsequent
 * frames (heartbeats, late-arriving garbage, an over-eager server) are
 * ignored — `done` is contractually the last meaningful event.
 */
function dispatchFrame(raw: string, handlers: FrameHandlers): boolean {
  let eventType = "message";
  const dataLines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue; // skip blank + comment
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const data = dataLines.join("\n");

  switch (eventType) {
    case "text_chunk": {
      try {
        const parsed = JSON.parse(data) as { text?: string };
        if (typeof parsed.text === "string") handlers.onTextChunk(parsed.text);
      } catch {
        // Malformed payload — skip rather than throw.
      }
      return false;
    }
    case "tool_call": {
      try {
        const parsed = JSON.parse(data) as {
          tool?: string;
          input?: Record<string, unknown>;
        };
        if (parsed.tool) {
          handlers.onToolCall({ tool: parsed.tool, input: parsed.input ?? {} });
        }
      } catch {
        // ignore
      }
      return false;
    }
    case "tool_result": {
      try {
        const parsed = JSON.parse(data) as { tool?: string; output_summary?: string };
        if (parsed.tool) {
          handlers.onToolResult(parsed.tool, parsed.output_summary ?? "");
        }
      } catch {
        // ignore
      }
      return false;
    }
    case "done": {
      let errorMsg: string | undefined;
      try {
        const parsed = JSON.parse(data) as { error?: string };
        if (typeof parsed.error === "string" && parsed.error.length > 0) {
          errorMsg = parsed.error;
        }
      } catch {
        // ignore — treat as happy completion
      }
      handlers.onDone(errorMsg);
      return true;
    }
    case "heartbeat": {
      handlers.onHeartbeat?.();
      return false;
    }
    default:
      handlers.onUnknown(eventType, data);
      return false;
  }
}

// ---------------------------------------------------------------------------
// Message-array mutators — kept outside the component body to avoid
// closing over stale state.
// ---------------------------------------------------------------------------

function appendToAssistant(prev: UIMessage[], id: string, chunk: string): UIMessage[] {
  return prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk, streaming: true } : m));
}

function addToolCallToAssistant(
  prev: UIMessage[],
  id: string,
  call: { tool: string; input: Record<string, unknown> },
): UIMessage[] {
  return prev.map((m) => {
    if (m.id !== id) return m;
    const next: UIToolCall = { tool: call.tool, input: call.input };
    return { ...m, tool_calls: [...(m.tool_calls ?? []), next] };
  });
}

function addToolResultToAssistant(
  prev: UIMessage[],
  id: string,
  toolName: string,
  summary: string,
): UIMessage[] {
  return prev.map((m) => {
    if (m.id !== id) return m;
    const calls = m.tool_calls ?? [];
    // Match the MOST RECENT unfilled tool_call for this tool — agents
    // can issue the same tool repeatedly (e.g. several search_policies
    // calls in one turn). The matching tool_result frame is always
    // paired with the latest such call, so scanning forward would attach
    // the result to an earlier call and shift every subsequent pairing
    // by one. Scan backward to honor call order.
    const nextCalls = [...calls];
    for (let i = nextCalls.length - 1; i >= 0; i -= 1) {
      const c = nextCalls[i];
      if (c.tool === toolName && c.output_summary === undefined) {
        nextCalls[i] = { ...c, output_summary: summary };
        break;
      }
    }
    return { ...m, tool_calls: nextCalls };
  });
}

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

function markAssistantError(
  setter: React.Dispatch<React.SetStateAction<UIMessage[]>>,
  id: string,
  reason: string,
): void {
  setter((prev) =>
    prev.map((m) => {
      if (m.id !== id) return m;
      const settledCalls =
        m.tool_calls?.map((tc) =>
          tc.output_summary === undefined ? { ...tc, output_summary: "unavailable" } : tc,
        ) ?? m.tool_calls;
      return { ...m, streaming: false, error: reason, tool_calls: settledCalls };
    }),
  );
}
