/**
 * Notifications SSE connection status (ticket 5.11).
 *
 * Updated by useProactiveAssistant; consumed by the layout reconnect chip.
 */

import { useEffect, useState } from "react";
import { create } from "zustand";

export type SseConnectionStatus = "connected" | "disconnected" | "idle";

type SseConnectionState = {
  status: SseConnectionStatus;
  disconnectedAt: number | null;
  setConnected: () => void;
  setDisconnected: () => void;
  reset: () => void;
};

export const useSseConnectionStore = create<SseConnectionState>((set) => ({
  status: "idle",
  disconnectedAt: null,
  setConnected: () => set({ status: "connected", disconnectedAt: null }),
  setDisconnected: () =>
    set((state) => ({
      status: "disconnected",
      disconnectedAt: state.disconnectedAt ?? Date.now(),
    })),
  reset: () => set({ status: "idle", disconnectedAt: null }),
}));

/**
 * Pure decision for the reconnecting chip: show it once the stream has
 * been disconnected for at least `thresholdMs`. Extracted so the boundary
 * behavior is unit-testable without rendering the hook (BUG-123 S1).
 */
export function shouldShowReconnectingChip(
  status: SseConnectionStatus,
  disconnectedAt: number | null,
  nowMs: number,
  thresholdMs: number,
): boolean {
  if (status !== "disconnected" || disconnectedAt === null) return false;
  return nowMs - disconnectedAt >= thresholdMs;
}

/** True when notifications stream has been disconnected > thresholdMs. */
export function useShowReconnectingChip(thresholdMs = 5000): boolean {
  const status = useSseConnectionStore((s) => s.status);
  const disconnectedAt = useSseConnectionStore((s) => s.disconnectedAt);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== "disconnected" || disconnectedAt === null) {
      setShow(false);
      return;
    }
    if (shouldShowReconnectingChip(status, disconnectedAt, Date.now(), thresholdMs)) {
      setShow(true);
      return;
    }
    const elapsed = Date.now() - disconnectedAt;
    const timer = setTimeout(() => setShow(true), thresholdMs - elapsed);
    return () => clearTimeout(timer);
  }, [status, disconnectedAt, thresholdMs]);

  return show;
}
