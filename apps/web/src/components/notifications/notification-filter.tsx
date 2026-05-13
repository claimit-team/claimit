"use client";

import type { NotificationEventType } from "@/lib/mock-notifications";
import { cn } from "@/lib/utils";

export type NotificationFilterValue = NotificationEventType | "all";

const FILTERS: { value: NotificationFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claim", label: "Claims" },
  { value: "purchase", label: "Purchases" },
  { value: "assistant", label: "Assistant" },
  { value: "system", label: "System" },
];

export function NotificationFilter({
  active,
  onChange,
}: {
  active: NotificationFilterValue;
  onChange: (next: NotificationFilterValue) => void;
}) {
  return (
    <div role="tablist" aria-label="Filter notifications" className="flex flex-wrap gap-2">
      {FILTERS.map(({ value, label }) => {
        const sel = active === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              sel
                ? "bg-brand-primary-600 text-neutral-0"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
