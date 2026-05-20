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

import { auth } from "@/lib/firebase";
import type { UIMessage, UIToolCall } from "@/types/assistant";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

type UseAssistantStreamResult = {
  /** Final + in-progress messages, in chronological order. */
  messages: UIMessage[];
  /** Convenience: true while a sendMessage is mid-stream. */
  streaming: boolean;
  /** Last error (network, auth, broker). Cleared on next sendMessage. */
  error: string | null;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  /** Aborts the in-flight stream if any. */
  cancel: () => void;
  /** Wipes the local message buffer — call when switching conversations. */
  reset: () => void;
  /**
   * Pre-populate the buffer with server-persisted messages (e.g. when
   * the user picks an existing conversation from history).
   */
  hydrate: (messages: UIMessage[]) => void;
};

export function useAssistantStream(): UseAssistantStreamResult {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
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
    async (conversationId: string, content: string): Promise<void> => {
      if (!API_BASE_URL) {
        setError("NEXT_PUBLIC_API_BASE_URL is not configured.");
        return;
      }
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("User must be signed in.");
        return;
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
      setError(null);

      let token: string;
      try {
        token = await currentUser.getIdToken();
      } catch {
        setError("Failed to load auth token.");
        setStreaming(false);
        markAssistantError(setMessages, assistantId, "auth failed");
        return;
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
      } catch (e) {
        if (controller.signal.aborted) {
          // Caller-initiated cancellation; not an error.
          markAssistantError(setMessages, assistantId, "cancelled");
          setStreaming(false);
          return;
        }
        setError(e instanceof Error ? e.message : "Network error");
        markAssistantError(setMessages, assistantId, "network failed");
        setStreaming(false);
        return;
      }

      if (!response.ok || !response.body) {
        setError(`Stream request failed: ${response.status}`);
        markAssistantError(setMessages, assistantId, `HTTP ${response.status}`);
        setStreaming(false);
        return;
      }

      try {
        await readSSEStream(response.body, controller.signal, {
          onTextChunk: (chunk) => {
            setMessages((prev) => appendToAssistant(prev, assistantId, chunk));
          },
          onToolCall: (call) => {
            setMessages((prev) => addToolCallToAssistant(prev, assistantId, call));
          },
          onToolResult: (toolName, summary) => {
            setMessages((prev) => addToolResultToAssistant(prev, assistantId, toolName, summary));
          },
          onDone: () => {
            setMessages((prev) => finalizeAssistant(prev, assistantId));
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
      } finally {
        setStreaming(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [],
  );

  return { messages, streaming, error, sendMessage, cancel, reset, hydrate };
}

// ---------------------------------------------------------------------------
// SSE frame parser — straight Web Streams API + TextDecoder.
// ---------------------------------------------------------------------------

interface FrameHandlers {
  onTextChunk: (chunk: string) => void;
  onToolCall: (call: { tool: string; input: Record<string, unknown> }) => void;
  onToolResult: (tool: string, output_summary: string) => void;
  onDone: () => void;
  onUnknown: (eventType: string, data: string) => void;
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  handlers: FrameHandlers,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line. Handle both \r\n\r\n and \n\n.
      while (true) {
        const frameEnd = findFrameEnd(buffer);
        if (frameEnd === -1) break;
        const frameRaw = buffer.slice(0, frameEnd);
        // Consume the frame + its terminator.
        buffer = buffer.slice(frameEnd + frameTerminatorLength(buffer, frameEnd));
        dispatchFrame(frameRaw, handlers);
      }
    }
  } finally {
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

function dispatchFrame(raw: string, handlers: FrameHandlers): void {
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
      return;
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
      return;
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
      return;
    }
    case "done":
      handlers.onDone();
      return;
    default:
      handlers.onUnknown(eventType, data);
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
    // Match the most recent tool_call entry for this tool name that
    // doesn't already have a result attached.
    let attached = false;
    const nextCalls = calls.map((c) => {
      if (!attached && c.tool === toolName && c.output_summary === undefined) {
        attached = true;
        return { ...c, output_summary: summary };
      }
      return c;
    });
    return { ...m, tool_calls: nextCalls };
  });
}

function finalizeAssistant(prev: UIMessage[], id: string): UIMessage[] {
  return prev.map((m) => (m.id === id ? { ...m, streaming: false } : m));
}

function markAssistantError(
  setter: React.Dispatch<React.SetStateAction<UIMessage[]>>,
  id: string,
  reason: string,
): void {
  setter((prev) => prev.map((m) => (m.id === id ? { ...m, streaming: false, error: reason } : m)));
}
