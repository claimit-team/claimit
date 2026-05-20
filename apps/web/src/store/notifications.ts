/**
 * Notifications store — single source of truth for the user's unread
 * count across the entire app shell.
 *
 * Background: ticket 5.28 originally wired the header bell badge
 * (useUnreadCount) and the /notifications page (useNotifications) as
 * two independent hooks each owning their own unreadCount state. That
 * left the bell stuck on its previous polled value for up to 60s
 * after a page-level ack/ackAll because there was no path between
 * the two hooks. This store is that path: every consumer reads from
 * and writes to the same `unreadCount` field, so an optimistic ack
 * on the page is visible on the bell on the next render frame.
 *
 * Mutators:
 * - `setUnreadCount(n)`           — server-authoritative writes from
 *                                   either hook's fetch/poll responses.
 * - `decrementUnread()`           — optimistic single-row ack from the
 *                                   page; floors at 0.
 * - `clearUnread()`               — optimistic Mark-all-read from the
 *                                   page.
 * - `resetOnSignOut()`            — auth flip → 0 (semantically distinct
 *                                   from a server "you have 0 unread"
 *                                   so callers read clearer).
 *
 * The store is intentionally minimal — it owns ONLY the count, not
 * the list. The list stays in useNotifications because it's
 * page-scoped and would clutter every consumer of the store.
 *
 * Future use: ticket 5.10 (Floating Assistant Panel) will subscribe
 * to the same `unreadCount` for its proactive-event ring badge.
 */

import { create } from "zustand";

type NotificationsState = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  decrementUnread: () => void;
  clearUnread: () => void;
  resetOnSignOut: () => void;
};

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount: Math.max(0, unreadCount) }),
  decrementUnread: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
  clearUnread: () => set({ unreadCount: 0 }),
  resetOnSignOut: () => set({ unreadCount: 0 }),
}));
