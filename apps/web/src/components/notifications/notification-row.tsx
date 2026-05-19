"use client";

import type { NotificationEvent } from "@claimit/mongodb-types";
import { formatDistanceToNow } from "date-fns";

import { EVENT_ICONS, EVENT_LABELS } from "@/lib/notifications/event-labels";
import { cn } from "@/lib/utils";

const iconWrap =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-neutral-0";

/**
 * Builds the row's body line. The backend places event-specific context
 * under `data` (a free-form Record<string, unknown>); we sniff a small
 * set of well-known fields and fall back to the type label when nothing
 * useful is present. Unknown shapes degrade gracefully — they never
 * crash the row.
 */
function buildBody(notification: NotificationEvent): string {
  const data = notification.data ?? {};

  const platform = typeof data.platform === "string" ? data.platform : null;
  const itemTitle = typeof data.item_title === "string" ? data.item_title : null;
  const merchant = typeof data.merchant === "string" ? data.merchant : null;
  const amount = typeof data.amount_saved === "number" ? data.amount_saved : null;
  const reason = typeof data.reason === "string" ? data.reason : null;
  const message = typeof data.message === "string" ? data.message : null;

  const parts: string[] = [];
  if (itemTitle) parts.push(itemTitle);
  if (platform || merchant) parts.push(`on ${platform ?? merchant}`);
  if (typeof amount === "number") parts.push(`(${formatUSD(amount)})`);
  if (reason) parts.push(`— ${reason}`);

  if (parts.length > 0) return parts.join(" ");
  if (message) return message;
  return EVENT_LABELS[notification.event_type];
}

function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTimeLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function NotificationRow({
  notification,
  onCardClick,
}: {
  notification: NotificationEvent;
  onCardClick?: (notification: NotificationEvent) => void;
}) {
  const Icon = EVENT_ICONS[notification.event_type];
  const title = EVENT_LABELS[notification.event_type];
  const description = buildBody(notification);
  const timeLabel = formatTimeLabel(notification.created_at);
  const isAcked = notification.acknowledged;

  const interactive = typeof onCardClick === "function";
  const Tag = interactive ? "button" : "article";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? () => onCardClick?.(notification) : undefined}
      aria-label={interactive ? `Open ${title}: ${description}` : undefined}
      className={cn(
        "flex w-full gap-4 border-b border-neutral-100 px-4 py-4 text-left transition-colors sm:px-6",
        interactive &&
          "hover:bg-neutral-50/90 focus-visible:bg-neutral-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        isAcked && "opacity-60",
      )}
    >
      <div className={cn(iconWrap, isAcked ? "border-neutral-200" : "border-brand-primary-200")}>
        <Icon
          className={cn("h-4 w-4", isAcked ? "text-neutral-500" : "text-brand-primary-600")}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <h3 className="font-medium leading-snug text-neutral-900">
            {title}
            {!isAcked && (
              <>
                <span
                  aria-hidden
                  className="ml-2 inline-block h-2 w-2 rounded-full bg-brand-primary-500 align-middle"
                />
                <span className="sr-only"> (unread)</span>
              </>
            )}
          </h3>
          <time className="shrink-0 text-xs tabular-nums text-neutral-500">{timeLabel}</time>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600">{description}</p>
      </div>
    </Tag>
  );
}
