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
 *
 * Cross-hook synchronization:
 * - The unread count is owned by useNotificationsStore (Zustand) so the
 *   header bell (useUnreadCount) and any other consumer see optimistic
 *   ack/ackAll updates on the next render frame, not after the next
 *   60s poll. This hook publishes server-authoritative writes from
 *   first-page / loadMore responses and optimistic deltas from ack /
 *   ackAll. The list itself stays page-local (it's only ever rendered
 *   on /notifications).
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
import { useAuthStore, useNotificationsStore } from "@/store";

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

  // Cross-hook unread count lives in the store. Selector-based reads
  // give stable action refs, so they're safe useCallback deps below.
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const decrementUnread = useNotificationsStore((s) => s.decrementUnread);
  const clearUnread = useNotificationsStore((s) => s.clearUnread);

  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<NotificationsApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Bumped on every first-page-load (filter change, auth flip, manual
  // refetch). loadMore captures the value at call time and aborts its
  // state mutations if the generation has drifted by the time its
  // response arrives — protects the list from stale results contaminating
  // the new filter.
  const generationRef = useRef(0);

  const refetch = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  // Filter values are passed through useEffect deps — when either flips
  // we transparently start a fresh first page (cursor=null, list reset).
  const acknowledgedFilter = filter?.acknowledged;
  const eventTypeFilter = filter?.event_type;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    // Bump first so any in-flight loadMore (started under the previous
    // generation) is invalidated regardless of which branch we take
    // below — including the auth-loading and unauthenticated branches.
    generationRef.current += 1;

    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setNotifications([]);
      clearUnread();
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
  }, [
    userId,
    isAuthLoading,
    acknowledgedFilter,
    eventTypeFilter,
    pageSize,
    reloadTick,
    setUnreadCount,
    clearUnread,
  ]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    // Snapshot the generation at request start. If the user changes a
    // filter (or signs out, or refetches) before the response lands,
    // the effect above bumps generationRef.current and we drop the DATA
    // writes below (notifications / unreadCount / nextCursor / error) —
    // applying them on top of the new filter's data would corrupt the
    // list. The UI loading flag (setIsLoadingMore) is intentionally NOT
    // gated by generation: this request is done either way and the
    // "Load more" button must release. There's no risk of clobbering a
    // newer in-flight loadMore on the new generation because the
    // filter-change effect resets the cursor to null, and loadMore
    // early-returns on a null cursor.
    const myGeneration = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await listNotifications({
        acknowledged: acknowledgedFilter,
        event_type: eventTypeFilter,
        limit: pageSize,
        cursor: nextCursor,
      });
      if (myGeneration !== generationRef.current) return;
      // Append; unread_count is the user-wide total so it can shift if the
      // background changed it (e.g. a new event arrived). Trust the server.
      setNotifications((prev) => [...prev, ...page.notifications]);
      setUnreadCount(page.unread_count);
      setNextCursor(page.next_cursor);
    } catch (err) {
      if (myGeneration !== generationRef.current) return;
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
  }, [nextCursor, isLoadingMore, acknowledgedFilter, eventTypeFilter, pageSize, setUnreadCount]);

  // List snapshot for optimistic-flip rollback. The unread count is no
  // longer mirrored locally — captured synchronously via
  // useNotificationsStore.getState() at the call site so a Zustand
  // update from the bell's poll between effect renders is included.
  const notificationsRef = useRef(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const ack = useCallback(
    async (notificationId: string) => {
      const prevList = notificationsRef.current;
      const prevUnread = useNotificationsStore.getState().unreadCount;

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
      decrementUnread();

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
    },
    [decrementUnread, setUnreadCount],
  );

  const ackAll = useCallback(async () => {
    const prevList = notificationsRef.current;
    const prevUnread = useNotificationsStore.getState().unreadCount;
    const hasUnread = prevList.some((n) => !n.acknowledged);
    if (!hasUnread && prevUnread === 0) {
      return 0;
    }

    const now = new Date().toISOString();
    const nextList = prevList.map((n) =>
      n.acknowledged ? n : { ...n, acknowledged: true, acknowledged_at: now },
    );
    setNotifications(nextList);
    clearUnread();

    try {
      return await ackAllApi();
    } catch (err) {
      setNotifications(prevList);
      setUnreadCount(prevUnread);
      throw err;
    }
  }, [clearUnread, setUnreadCount]);

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
