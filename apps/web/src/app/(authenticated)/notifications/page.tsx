"use client";

import type { NotificationEvent, NotificationEventType } from "@claimit/mongodb-types";
import { isToday, isYesterday, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { NotificationEmpty } from "@/components/notifications/notification-empty";
import {
  NotificationFilter,
  type NotificationStatusFilter,
} from "@/components/notifications/notification-filter";
import { NotificationGroupSection } from "@/components/notifications/notification-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/useNotifications";

type Group = { label: string; events: NotificationEvent[] };

/**
 * Buckets notifications by relative date (Today / Yesterday / Earlier).
 * The hook returns events already sorted DESC by created_at so a single
 * pass preserves order within each bucket without an extra sort.
 */
function groupByDate(events: NotificationEvent[]): Group[] {
  const today: NotificationEvent[] = [];
  const yesterday: NotificationEvent[] = [];
  const earlier: NotificationEvent[] = [];

  for (const evt of events) {
    const date = parseISO(evt.created_at);
    if (Number.isNaN(date.getTime())) {
      earlier.push(evt);
      continue;
    }
    if (isToday(date)) today.push(evt);
    else if (isYesterday(date)) yesterday.push(evt);
    else earlier.push(evt);
  }

  const groups: Group[] = [];
  if (today.length) groups.push({ label: "Today", events: today });
  if (yesterday.length) groups.push({ label: "Yesterday", events: yesterday });
  if (earlier.length) groups.push({ label: "Earlier", events: earlier });
  return groups;
}

/**
 * Routes a notification's `entity_type` + `entity_id` to the right
 * detail page. Returns null when the entity isn't navigable so the
 * caller can fall back to "ack only, no nav".
 */
function destinationFor(notification: NotificationEvent): string | null {
  if (!notification.entity_id) return null;
  switch (notification.entity_type) {
    case "claim":
      return `/claims/${notification.entity_id}`;
    case "purchase":
      return `/purchases/${notification.entity_id}`;
    case "conversation":
      return `/assistant/${notification.entity_id}`;
    default:
      return null;
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<NotificationStatusFilter>("all");
  const [eventType, setEventType] = useState<NotificationEventType | null>(null);

  const filter = useMemo(
    () => ({
      // status="all" is the default — only set acknowledged when the
      // user explicitly picks "Unread", so the server keeps full
      // efficiency on the index when nothing is filtered.
      acknowledged: status === "unread" ? false : undefined,
      event_type: eventType ?? undefined,
    }),
    [status, eventType],
  );

  const {
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
  } = useNotifications({ filter });

  const groups = useMemo(() => groupByDate(notifications), [notifications]);

  const handleCardClick = async (n: NotificationEvent) => {
    const dest = destinationFor(n);
    // Optimistic ack first so the row dims immediately, then nav.
    // Failures are non-fatal — we still let the user reach the detail
    // page; the next refetch will reconcile.
    void ack(n._id).catch(() => {
      toast.error("Couldn't update that notification. Please try again.");
    });
    if (dest) router.push(dest);
  };

  const handleMarkAllRead = async () => {
    try {
      await ackAll();
      toast.success("All notifications marked as read.");
    } catch {
      toast.error("Couldn't mark all as read. Please try again.");
    }
  };

  const showInitialSkeleton = isLoading && notifications.length === 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-24 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Notifications</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Alerts from claims monitoring, Gmail ingest, and the assistant — all in one stream.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
        >
          Mark all read
        </Button>
      </div>

      <NotificationFilter
        status={status}
        onStatusChange={setStatus}
        eventType={eventType}
        onEventTypeChange={setEventType}
        unreadCount={unreadCount}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="mb-3 text-sm">{error.message}</p>
            <Button type="button" size="sm" variant="outline" onClick={refetch}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {showInitialSkeleton ? (
        <div className="-mx-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm lg:mx-0">
          <Skeleton className="h-10 w-24 mx-4 my-3 sm:mx-6" />
          <div className="max-h-[min(70dvh,640px)] overflow-y-auto">
            {(["a", "b", "c", "d", "e", "f"] as const).map((key) => (
              <div key={key} className="flex gap-4 border-b border-neutral-100 px-4 py-4 sm:px-6">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <NotificationEmpty
          variant={status === "unread" ? "unread" : eventType !== null ? "filtered" : "all"}
        />
      ) : (
        <>
          <div className="-mx-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm lg:mx-0">
            <div className="max-h-[min(70dvh,640px)] overflow-y-auto">
              {groups.map((group) => (
                <NotificationGroupSection
                  key={group.label}
                  label={group.label}
                  events={group.events}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          </div>

          {nextCursor ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void loadMore();
                }}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
