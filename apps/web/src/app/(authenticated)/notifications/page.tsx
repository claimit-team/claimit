"use client";

import { useMemo, useState } from "react";
import { NotificationEmpty } from "@/components/notifications/notification-empty";
import {
  NotificationFilter,
  type NotificationFilterValue,
} from "@/components/notifications/notification-filter";
import { NotificationGroupSection } from "@/components/notifications/notification-group";
import { mockNotifications } from "@/lib/mock-notifications";

export default function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationFilterValue>("all");

  const grouped = useMemo(() => {
    return mockNotifications.groups
      .map((g) => ({
        ...g,
        events: g.events.filter((evt) => filter === "all" || evt.eventType === filter),
      }))
      .filter((g) => g.events.length > 0);
  }, [filter]);

  const totalShown = grouped.reduce((n, g) => n + g.events.length, 0);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto flex flex-col gap-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Notifications</h1>
        <p className="text-neutral-600 mt-1 text-sm">
          Alerts from claims monitoring, Gmail ingest, and the assistant — all in one stream.
        </p>
      </div>

      <NotificationFilter active={filter} onChange={setFilter} />

      {totalShown === 0 ? (
        <NotificationEmpty />
      ) : (
        <div className="-mx-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm lg:mx-0">
          <div className="max-h-[min(70dvh,640px)] overflow-y-auto">
            {grouped.map((group) => (
              <NotificationGroupSection
                key={group.label}
                label={group.label}
                events={group.events}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
