/**
 * SSE frame parser for the chat stream (extracted from useAssistantStream
 * so it can be unit-tested without pulling in firebase/React — BUG-123 S3).
 *
 * Reads a fetch ReadableStream body and dispatches parsed SSE frames to
 * handler callbacks. Handles:
 * - Multi-chunk frames (one `event:`/`data:` block split across reads).
 * - Heartbeat / comment lines (lines beginning with `:`) — ignored.
 * - Unknown event types — routed to `onUnknown` so a future backend event
 *   doesn't crash the stream.
 * - Stall detection: if no frame arrives within `stallMs`, `onStall` fires;
 *   any subsequent activity (incl. heartbeats) re-arms the timer and the
 *   consumer can clear its stalled state via `onActivity`/`onHeartbeat`.
 */

/** 3× the server's 15s heartbeat interval (conversations route). */
export const STREAM_STALL_MS = 45_000;

export interface FrameHandlers {
  onTextChunk: (chunk: string) => void;
  onToolCall: (call: { tool: string; input: Record<string, unknown> }) => void;
  onToolResult: (tool: string, output_summary: string) => void;
  onDone: (errorMsg?: string, traceId?: string) => void;
  onUnknown: (eventType: string, data: string) => void;
  onHeartbeat?: () => void;
  onStall?: () => void;
  onActivity?: () => void;
  stallMs?: number;
}

export async function readSSEStream(
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
      let traceId: string | undefined;
      try {
        const parsed = JSON.parse(data) as { error?: string; trace_id?: string };
        if (typeof parsed.error === "string" && parsed.error.length > 0) {
          errorMsg = parsed.error;
        }
        if (typeof parsed.trace_id === "string" && parsed.trace_id.length > 0) {
          traceId = parsed.trace_id;
        }
      } catch {
        // ignore — treat as happy completion
      }
      handlers.onDone(errorMsg, traceId);
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
