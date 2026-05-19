"use client";

import type { NotificationEvent } from "@claimit/mongodb-types";

import { NotificationRow } from "@/components/notifications/notification-row";

export function NotificationGroupSection({
  label,
  events,
  onCardClick,
}: {
  label: string;
  events: NotificationEvent[];
  onCardClick?: (notification: NotificationEvent) => void;
}) {
  if (!events.length) return null;

  return (
    <section className="last:pb-0">
      <h2 className="sticky top-0 z-[1] border-b border-neutral-100 bg-neutral-0/95 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 backdrop-blur-sm sm:px-6">
        {label}
      </h2>
      <div>
        {events.map((evt) => (
          <NotificationRow key={evt._id} notification={evt} onCardClick={onCardClick} />
        ))}
      </div>
    </section>
  );
}
