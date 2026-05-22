/**
 * useProactiveAssistant — subscribes to the notifications SSE stream
 * and routes proactive-eligible notifications into the UI store so the
 * Floating Panel can auto-surface them.
 *
 * Why EventSource (and not fetch):
 * The notifications stream is GET /api/v1/events/stream — a long-lived
 * GET that already supports query-param auth (?token=<firebase_id_token>)
 * specifically because EventSource cannot set Authorization headers.
 * Native EventSource gives us automatic reconnect with `retry:` field
 * support; using it here is simpler than rewriting that logic against
 * ReadableStream.
 *
 * Token refresh:
 * Firebase ID tokens expire after ~1 hour. We force a reconnect every
 * 50 minutes with a fresh getIdToken() so the stream doesn't 401 on
 * us mid-session.
 *
 * Mount this hook ONCE at the authenticated layout level — multiple
 * mounts would open redundant EventSource connections and double-fire
 * proactive surfacing.
 */

"use client";

import { useEffect, useRef } from "react";

import { auth } from "@/lib/firebase";
import { generateProactiveOutput, PROACTIVE_EVENT_TYPES } from "@/lib/proactive-templates";
import { computeBackoffMs } from "@/lib/sse/backoff";
import { useSseConnectionStore } from "@/lib/sse/connection-status";
import { useAuthStore, useUIStore } from "@/store";
import { useAutoSendBannerStore } from "@/store/auto-send-banner";
import { useClaimDetailRefetchStore } from "@/store/claim-detail-refetch";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const TOKEN_REFRESH_MS = 50 * 60 * 1000; // 50 min — safely under the 60min Firebase expiry
const SEEN_NOTIFICATION_MAX = 500;

type NotificationFrame = {
  _id?: string;
  user_id?: string;
  event_type?: string;
  data?: unknown;
};

/** FIFO-capped dedup set for notification `_id` values (ticket 5.11). */
const seenNotificationIds: string[] = [];

function rememberNotificationId(id: string): boolean {
  if (seenNotificationIds.includes(id)) return false;
  seenNotificationIds.push(id);
  if (seenNotificationIds.length > SEEN_NOTIFICATION_MAX) {
    seenNotificationIds.shift();
  }
  return true;
}

export function useProactiveAssistant(): void {
  const userId = useAuthStore((s) => s.user?._id ?? null);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const setProactiveEvent = useUIStore((s) => s.setProactiveEvent);
  const addBannerRow = useAutoSendBannerStore((s) => s.addRow);
  const markBannerSent = useAutoSendBannerStore((s) => s.markSent);
  const setSseConnected = useSseConnectionStore((s) => s.setConnected);
  const setSseDisconnected = useSseConnectionStore((s) => s.setDisconnected);
  const resetSseConnection = useSseConnectionStore((s) => s.reset);

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureCountRef = useRef(0);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!userId) return;
    if (!API_BASE_URL) {
      return;
    }

    let cancelled = false;

    async function connect(): Promise<void> {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      let token: string;
      try {
        token = await currentUser.getIdToken();
      } catch {
        setSseDisconnected();
        scheduleReconnect();
        return;
      }
      if (cancelled) return;

      const url = `${API_BASE_URL}/api/v1/events/stream?token=${encodeURIComponent(token)}`;
      const source = new EventSource(url);
      sourceRef.current = source;

      source.addEventListener("notification", (evt: MessageEvent) => {
        try {
          const frame = JSON.parse(evt.data) as NotificationFrame;
          if (frame._id && !rememberNotificationId(frame._id)) {
            return;
          }
          handleNotificationFrame(frame, setProactiveEvent);
          handleAutoSendBannerFanout(frame, addBannerRow, markBannerSent);
          handleClaimDraftedFanout(frame);
        } catch {
          // Malformed frame — drop; the stream itself stays open.
        }
      });

      source.addEventListener("error", () => {
        if (cancelled) return;
        setSseDisconnected();
        source.close();
        sourceRef.current = null;
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        scheduleReconnect();
      });

      source.addEventListener("open", () => {
        failureCountRef.current = 0;
        setSseConnected();
      });

      refreshTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        source.close();
        sourceRef.current = null;
        void connect();
      }, TOKEN_REFRESH_MS);
    }

    function scheduleReconnect(): void {
      if (cancelled) return;
      const attempt = failureCountRef.current++;
      const delay = computeBackoffMs(attempt, { baseMs: 1000, maxMs: 30_000 });
      reconnectTimerRef.current = setTimeout(() => {
        void connect();
      }, delay);
    }

    void connect();

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      failureCountRef.current = 0;
      resetSseConnection();
    };
  }, [
    userId,
    isAuthLoading,
    setProactiveEvent,
    addBannerRow,
    markBannerSent,
    setSseConnected,
    setSseDisconnected,
    resetSseConnection,
  ]);
}

function handleAutoSendBannerFanout(
  frame: NotificationFrame,
  addRow: ReturnType<typeof useAutoSendBannerStore.getState>["addRow"],
  markSent: ReturnType<typeof useAutoSendBannerStore.getState>["markSent"],
): void {
  const eventType = frame.event_type;
  if (eventType !== "claim_queued_auto" && eventType !== "claim_submitted") return;
  const data = (frame.data ?? {}) as Record<string, unknown>;
  const claimId = typeof data.claim_id === "string" ? data.claim_id : null;
  if (!claimId) return;
  if (eventType === "claim_queued_auto") {
    const platform = typeof data.platform === "string" ? data.platform : "claim";
    const autoSendAt = typeof data.auto_send_at === "string" ? data.auto_send_at : null;
    if (!autoSendAt) return;
    addRow({ claimId, platform, autoSendAt, state: "queued" });
    return;
  }
  markSent(claimId);
}

function handleClaimDraftedFanout(frame: NotificationFrame): void {
  if (frame.event_type !== "claim_drafted") return;
  const data = (frame.data ?? {}) as Record<string, unknown>;
  const claimId = typeof data.claim_id === "string" ? data.claim_id : null;
  if (!claimId) return;
  void useClaimDetailRefetchStore.getState().triggerRefetch(claimId);
}

function handleNotificationFrame(
  frame: NotificationFrame,
  setProactiveEvent: ReturnType<typeof useUIStore.getState>["setProactiveEvent"],
): void {
  const eventType = frame.event_type;
  if (!eventType || !PROACTIVE_EVENT_TYPES.has(eventType)) {
    return;
  }
  const notificationId = frame._id;
  if (!notificationId) return;

  const output = generateProactiveOutput(eventType, frame.data);
  if (!output) return;

  setProactiveEvent({
    notificationId,
    output,
    eventType,
    data: frame.data,
  });
}
