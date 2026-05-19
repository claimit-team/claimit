/**
 * useUnreadCount — drives the header bell badge.
 *
 * Issues a tiny `GET /notifications?limit=1` and only reads the
 * `unread_count` from the response (the API returns a user-wide total
 * regardless of filters). Polling cadence is intentionally conservative:
 *
 * - 60s interval while the tab is visible.
 * - Immediate refetch on `window focus` so a user returning from another
 *   tab/window sees the freshest count without waiting up to a minute.
 * - Skipped entirely while the document is hidden — avoids burning
 *   tokens for background tabs that no one is looking at.
 *
 * The hook does not own a list, never paginates, and never errors loudly:
 * a failed poll keeps the previous count and silently retries on the
 * next tick. Header bells must never crash the app shell.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listNotifications } from "@/lib/api/notifications";
import { useAuthStore } from "@/store";

const POLL_INTERVAL_MS = 60_000;

type UseUnreadCountResult = {
  unreadCount: number;
  refetch: () => void;
};

export function useUnreadCount(): UseUnreadCountResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [unreadCount, setUnreadCount] = useState<number>(0);
  // Tracks the latest in-flight request so a stale response can never
  // overwrite a newer one.
  const requestSeqRef = useRef(0);

  const fetchOnce = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const seq = ++requestSeqRef.current;
    try {
      const page = await listNotifications({ limit: 1 });
      // Newer request already finished; drop this one.
      if (seq !== requestSeqRef.current) return;
      setUnreadCount(page.unread_count);
    } catch {
      // Header badge: silent failure preserves the previous count.
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading || !userId) {
      // Invalidate any in-flight poll captured under the previous user
      // — without this bump, a fetchOnce started just before sign-out
      // can resolve afterward and re-write a stale unread count over
      // the cleared 0.
      requestSeqRef.current += 1;
      setUnreadCount(0);
      return;
    }

    void fetchOnce();
    const intervalId = window.setInterval(() => {
      void fetchOnce();
    }, POLL_INTERVAL_MS);

    const onFocus = () => {
      void fetchOnce();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, isAuthLoading, fetchOnce]);

  const refetch = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { unreadCount, refetch };
}
