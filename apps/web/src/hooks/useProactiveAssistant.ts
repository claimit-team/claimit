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
import { useAuthStore, useUIStore } from "@/store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const TOKEN_REFRESH_MS = 50 * 60 * 1000; // 50 min — safely under the 60min Firebase expiry
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

type NotificationFrame = {
  _id?: string;
  user_id?: string;
  event_type?: string;
  data?: unknown;
};

export function useProactiveAssistant(): void {
  const userId = useAuthStore((s) => s.user?._id ?? null);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const setProactiveEvent = useUIStore((s) => s.setProactiveEvent);

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureCountRef = useRef(0);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!userId) return;
    if (!API_BASE_URL) {
      // Misconfigured client — silently skip. The notifications page
      // already surfaces the same misconfiguration as a visible error.
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
          handleNotificationFrame(frame, setProactiveEvent);
        } catch {
          // Malformed frame — drop; the stream itself stays open.
        }
      });

      source.addEventListener("error", () => {
        // `error` fires on both transient blips and permanent closures;
        // EventSource itself will retry, but we layer our own controlled
        // backoff + token refresh on top because Firebase tokens expire.
        if (cancelled) return;
        source.close();
        sourceRef.current = null;
        // The previous connect()'s refresh timer is now stale — it would
        // close-and-reconnect a connection that doesn't exist anymore, or
        // worse, a NEW one our backoff is about to open. Cancel it so
        // there's exactly one timeline owning the next reconnect.
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        scheduleReconnect();
      });

      source.addEventListener("open", () => {
        failureCountRef.current = 0;
      });

      // Schedule a token refresh — close + reconnect every 50 min so we
      // never see a 401 from an expired token mid-stream.
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
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
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
    };
  }, [userId, isAuthLoading, setProactiveEvent]);
}

function handleNotificationFrame(
  frame: NotificationFrame,
  setProactiveEvent: ReturnType<typeof useUIStore.getState>["setProactiveEvent"],
): void {
  const eventType = frame.event_type;
  if (!eventType || !PROACTIVE_EVENT_TYPES.has(eventType)) {
    // Notifications that don't map to a proactive template still drive
    // the header bell unread count (via useUnreadCount poll) — they
    // simply don't auto-open the assistant panel.
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
  });
}
