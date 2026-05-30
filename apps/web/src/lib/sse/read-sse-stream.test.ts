import { afterEach, describe, expect, it, vi } from "vitest";

import { type FrameHandlers, readSSEStream, STREAM_STALL_MS } from "@/lib/sse/read-sse-stream";

const enc = new TextEncoder();

/** A ReadableStream whose chunks are pushed/closed manually by the test. */
function controllableStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    push: (s: string) => controller.enqueue(enc.encode(s)),
    close: () => controller.close(),
  };
}

function makeHandlers(overrides: Partial<FrameHandlers> = {}): FrameHandlers {
  return {
    onTextChunk: vi.fn(),
    onToolCall: vi.fn(),
    onToolResult: vi.fn(),
    onDone: vi.fn(),
    onUnknown: vi.fn(),
    onHeartbeat: vi.fn(),
    onStall: vi.fn(),
    onActivity: vi.fn(),
    stallMs: STREAM_STALL_MS,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("readSSEStream — graceful degradation (BUG-123 S3)", () => {
  it("fires onStall after stallMs of silence; activity re-arms the timer", async () => {
    vi.useFakeTimers();
    const ctrl = controllableStream();
    const handlers = makeHandlers();
    const ac = new AbortController();
    const pending = readSSEStream(ctrl.stream, ac.signal, handlers);

    // No frames yet — stall must not fire early, but must fire at the threshold.
    await vi.advanceTimersByTimeAsync(STREAM_STALL_MS - 1);
    expect(handlers.onStall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(handlers.onStall).toHaveBeenCalledTimes(1);

    // A heartbeat counts as activity: clears stalled state and re-arms.
    ctrl.push(":keepalive\n\nevent: heartbeat\ndata: {}\n\n");
    await vi.advanceTimersByTimeAsync(0);
    expect(handlers.onHeartbeat).toHaveBeenCalledTimes(1);
    expect(handlers.onActivity).toHaveBeenCalled();

    // The next stall is a fresh stallMs out from the heartbeat.
    await vi.advanceTimersByTimeAsync(STREAM_STALL_MS - 1);
    expect(handlers.onStall).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(handlers.onStall).toHaveBeenCalledTimes(2);

    ctrl.close();
    await vi.advanceTimersByTimeAsync(0);
    await pending;
  });

  it("dispatches text/tool frames and stops on the terminal done frame", async () => {
    const ctrl = controllableStream();
    const handlers = makeHandlers({ stallMs: undefined, onStall: undefined });
    const ac = new AbortController();
    const pending = readSSEStream(ctrl.stream, ac.signal, handlers);

    ctrl.push('event: text_chunk\ndata: {"text":"Hello"}\n\n');
    ctrl.push('event: tool_call\ndata: {"tool":"get_claim_context","input":{}}\n\n');
    ctrl.push('event: done\ndata: {"trace_id":"t-1"}\n\n');
    // A late frame after `done` must be ignored (done is terminal).
    ctrl.push('event: text_chunk\ndata: {"text":"late"}\n\n');

    await pending;

    expect(handlers.onTextChunk).toHaveBeenCalledTimes(1);
    expect(handlers.onTextChunk).toHaveBeenCalledWith("Hello");
    expect(handlers.onToolCall).toHaveBeenCalledWith({ tool: "get_claim_context", input: {} });
    expect(handlers.onDone).toHaveBeenCalledWith(undefined, "t-1");
  });

  it("ends gracefully when the network drops mid-frame (no done)", async () => {
    const ctrl = controllableStream();
    const handlers = makeHandlers({ stallMs: undefined, onStall: undefined });
    const ac = new AbortController();
    const pending = readSSEStream(ctrl.stream, ac.signal, handlers);

    // Half a frame arrives, then the connection drops.
    ctrl.push('event: text_chunk\ndata: {"text":"par');
    ctrl.close();

    await expect(pending).resolves.toBeUndefined();
    expect(handlers.onTextChunk).not.toHaveBeenCalled(); // incomplete frame discarded
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it("stops immediately when the abort signal is already set", async () => {
    const ctrl = controllableStream();
    const handlers = makeHandlers({ stallMs: undefined, onStall: undefined });
    const ac = new AbortController();
    ac.abort();

    const pending = readSSEStream(ctrl.stream, ac.signal, handlers);
    ctrl.push('event: text_chunk\ndata: {"text":"x"}\n\n');

    await expect(pending).resolves.toBeUndefined();
    expect(handlers.onTextChunk).not.toHaveBeenCalled();
  });
});
