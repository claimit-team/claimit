/**
 * useNotifications — drives the /notifications page.
 *
 * Fetches the first page when filters change, supports cursor-based
 * "Load more", and exposes optimistic ack helpers for single-row clicks
 * and the "Mark all read" action.
 *
 * Pattern mirrors useDashboardSummary:
 * - Wait for AuthInit (useAuthStore.isLoading === false).
 * - mounted-flag guards against state updates after unmount.
 * - Errors are surfaced as NotificationsApiError; callers render them.
 *
 * Filter semantics:
 * - The `acknowledged` filter and `event_type` filter are sent as query
 *   params and reset the cursor / list when they change.
 * - The shared `unread_count` returned from the API is the user's TOTAL
 *   unread across the whole dataset (not scoped by current filter), so
 *   it is safe to wire directly into the "Unread" tab badge AND the
 *   header bell.
 */

"use client";

import type { NotificationEvent, NotificationEventType } from "@claimit/mongodb-types";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ackAllNotifications as ackAllApi,
  ackNotification as ackOneApi,
  listNotifications,
  NotificationsApiError,
} from "@/lib/api/notifications";
import { useAuthStore } from "@/store";

export type NotificationsFilter = {
  acknowledged?: boolean;
  event_type?: NotificationEventType;
};

type UseNotificationsArgs = {
  filter?: NotificationsFilter;
  pageSize?: number;
};

type UseNotificationsResult = {
  notifications: NotificationEvent[];
  unreadCount: number;
  nextCursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: NotificationsApiError | null;
  refetch: () => void;
  loadMore: () => Promise<void>;
  ack: (notificationId: string) => Promise<void>;
  ackAll: () => Promise<number>;
};

const DEFAULT_PAGE_SIZE = 20;

export function useNotifications({
  filter,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseNotificationsArgs = {}): UseNotificationsResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<NotificationsApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const refetch = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  // Filter values are passed through useEffect deps — when either flips
  // we transparently start a fresh first page (cursor=null, list reset).
  const acknowledgedFilter = filter?.acknowledged;
  const eventTypeFilter = filter?.event_type;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
      setError(new NotificationsApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    listNotifications({
      acknowledged: acknowledgedFilter,
      event_type: eventTypeFilter,
      limit: pageSize,
    })
      .then((page) => {
        if (!mounted) return;
        setNotifications(page.notifications);
        setUnreadCount(page.unread_count);
        setNextCursor(page.next_cursor);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        if (err instanceof NotificationsApiError) {
          setError(err);
        } else {
          setError(
            new NotificationsApiError(
              "unknown_error",
              err instanceof Error ? err.message : "Unknown error",
            ),
          );
        }
        // Stale-while-error: keep the previously rendered page so a
        // transient backend hiccup doesn't blank the entire feed.
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, isAuthLoading, acknowledgedFilter, eventTypeFilter, pageSize, reloadTick]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await listNotifications({
        acknowledged: acknowledgedFilter,
        event_type: eventTypeFilter,
        limit: pageSize,
        cursor: nextCursor,
      });
      // Append; unread_count is the user-wide total so it can shift if the
      // background changed it (e.g. a new event arrived). Trust the server.
      setNotifications((prev) => [...prev, ...page.notifications]);
      setUnreadCount(page.unread_count);
      setNextCursor(page.next_cursor);
    } catch (err) {
      if (err instanceof NotificationsApiError) {
        setError(err);
      } else {
        setError(
          new NotificationsApiError(
            "unknown_error",
            err instanceof Error ? err.message : "Unknown error",
          ),
        );
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, acknowledgedFilter, eventTypeFilter, pageSize]);

  // The optimistic helpers below capture state via the latest closure
  // values stored in refs. setState callback form is fine for the flip
  // itself, but TS can't narrow a snapshot variable mutated inside the
  // setState callback — explicit refs are clearer and let us roll back
  // synchronously on failure.
  const notificationsRef = useRef(notifications);
  const unreadCountRef = useRef(unreadCount);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);
  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const ack = useCallback(async (notificationId: string) => {
    const prevList = notificationsRef.current;
    const prevUnread = unreadCountRef.current;

    const idx = prevList.findIndex((n) => n._id === notificationId);
    if (idx === -1) return;
    const target = prevList[idx];
    if (target.acknowledged) {
      // Already acked locally — fire-and-forget the server call so a
      // re-click is still a no-op (the server short-circuits too).
      try {
        await ackOneApi(notificationId);
      } catch {
        // Swallow: nothing to roll back.
      }
      return;
    }

    const optimistic: NotificationEvent = {
      ...target,
      acknowledged: true,
      acknowledged_at: target.acknowledged_at ?? new Date().toISOString(),
    };
    const nextList = [...prevList];
    nextList[idx] = optimistic;
    setNotifications(nextList);
    setUnreadCount(prevUnread > 0 ? prevUnread - 1 : prevUnread);

    try {
      const updated = await ackOneApi(notificationId);
      setNotifications((curr) => {
        const i = curr.findIndex((n) => n._id === notificationId);
        if (i === -1) return curr;
        const next = [...curr];
        next[i] = updated;
        return next;
      });
    } catch (err) {
      setNotifications(prevList);
      setUnreadCount(prevUnread);
      throw err;
    }
  }, []);

  const ackAll = useCallback(async () => {
    const prevList = notificationsRef.current;
    const prevUnread = unreadCountRef.current;
    const hasUnread = prevList.some((n) => !n.acknowledged);
    if (!hasUnread && prevUnread === 0) {
      return 0;
    }

    const now = new Date().toISOString();
    const nextList = prevList.map((n) =>
      n.acknowledged ? n : { ...n, acknowledged: true, acknowledged_at: now },
    );
    setNotifications(nextList);
    setUnreadCount(0);

    try {
      return await ackAllApi();
    } catch (err) {
      setNotifications(prevList);
      setUnreadCount(prevUnread);
      throw err;
    }
  }, []);

  return {
    notifications,
    unreadCount,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    refetch,
    loadMore,
    ack,
    ackAll,
  };
}
