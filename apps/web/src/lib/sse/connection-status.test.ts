import { beforeEach, describe, expect, it } from "vitest";

import { shouldShowReconnectingChip, useSseConnectionStore } from "@/lib/sse/connection-status";

// Reset the module-level zustand store between tests so transitions are
// asserted from a known baseline (BUG-123 S1).
beforeEach(() => {
  useSseConnectionStore.getState().reset();
});

describe("sse connection store transitions", () => {
  it("starts idle with no disconnect timestamp", () => {
    const s = useSseConnectionStore.getState();
    expect(s.status).toBe("idle");
    expect(s.disconnectedAt).toBeNull();
  });

  it("stamps disconnectedAt on first disconnect and keeps it sticky", () => {
    useSseConnectionStore.getState().setDisconnected();
    const first = useSseConnectionStore.getState().disconnectedAt;
    expect(first).not.toBeNull();
    expect(useSseConnectionStore.getState().status).toBe("disconnected");

    // A second disconnect (e.g. a failed reconnect) must NOT reset the
    // clock — otherwise the chip's elapsed-time threshold never matures.
    useSseConnectionStore.getState().setDisconnected();
    expect(useSseConnectionStore.getState().disconnectedAt).toBe(first);
  });

  it("clears the timestamp on connect and reset", () => {
    useSseConnectionStore.getState().setDisconnected();
    useSseConnectionStore.getState().setConnected();
    expect(useSseConnectionStore.getState().status).toBe("connected");
    expect(useSseConnectionStore.getState().disconnectedAt).toBeNull();

    useSseConnectionStore.getState().setDisconnected();
    useSseConnectionStore.getState().reset();
    expect(useSseConnectionStore.getState().status).toBe("idle");
    expect(useSseConnectionStore.getState().disconnectedAt).toBeNull();
  });
});

describe("shouldShowReconnectingChip", () => {
  const THRESHOLD = 5000;

  it("is hidden while connected or idle regardless of timestamp", () => {
    expect(shouldShowReconnectingChip("connected", null, 10_000, THRESHOLD)).toBe(false);
    expect(shouldShowReconnectingChip("idle", null, 10_000, THRESHOLD)).toBe(false);
    // A stale disconnectedAt on a non-disconnected status is ignored.
    expect(shouldShowReconnectingChip("connected", 0, 10_000, THRESHOLD)).toBe(false);
  });

  it("is hidden when disconnected but with no timestamp", () => {
    expect(shouldShowReconnectingChip("disconnected", null, 10_000, THRESHOLD)).toBe(false);
  });

  it("stays hidden until the threshold elapses, then shows", () => {
    const at = 1_000_000;
    expect(shouldShowReconnectingChip("disconnected", at, at + 4_999, THRESHOLD)).toBe(false);
    expect(shouldShowReconnectingChip("disconnected", at, at + 5_000, THRESHOLD)).toBe(true);
    expect(shouldShowReconnectingChip("disconnected", at, at + 30_000, THRESHOLD)).toBe(true);
  });
});
