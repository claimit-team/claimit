"use client";

import type { NotificationEventType } from "@claimit/mongodb-types";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_LABELS, FILTERABLE_EVENT_TYPES } from "@/lib/notifications/event-labels";
import { cn } from "@/lib/utils";

export type NotificationStatusFilter = "all" | "unread";
const ALL_TYPES_VALUE = "__all__";

type Tab = { value: NotificationStatusFilter; label: string };

const TABS: readonly Tab[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

export function NotificationFilter({
  status,
  onStatusChange,
  eventType,
  onEventTypeChange,
  unreadCount,
}: {
  status: NotificationStatusFilter;
  onStatusChange: (next: NotificationStatusFilter) => void;
  eventType: NotificationEventType | null;
  onEventTypeChange: (next: NotificationEventType | null) => void;
  unreadCount: number;
}) {
  const selectValue = eventType ?? ALL_TYPES_VALUE;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Filter notifications" className="flex flex-wrap gap-2">
        {TABS.map(({ value, label }) => {
          const sel = status === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={sel}
              onClick={() => onStatusChange(value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                sel
                  ? "bg-brand-primary-600 text-neutral-0"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
              )}
            >
              <span>{label}</span>
              {value === "unread" && unreadCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                    sel
                      ? "bg-neutral-0/20 text-neutral-0"
                      : "bg-brand-primary-100 text-brand-primary-700",
                  )}
                >
                  <span className="sr-only">{unreadCount} unread</span>
                  <span aria-hidden>{unreadCount > 99 ? "99+" : unreadCount}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Select
        value={selectValue}
        onValueChange={(next) =>
          onEventTypeChange(next === ALL_TYPES_VALUE ? null : (next as NotificationEventType))
        }
      >
        <SelectTrigger className="h-9 w-full max-w-[16rem] sm:w-56" aria-label="Filter by type">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES_VALUE}>All types</SelectItem>
          {FILTERABLE_EVENT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {EVENT_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
