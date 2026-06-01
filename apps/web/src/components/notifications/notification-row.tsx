"use client";

import type { NotificationEvent, NotificationEventType } from "@claimit/mongodb-types";
import { formatDistanceToNow } from "date-fns";

import { EVENT_ICONS, EVENT_LABELS } from "@/lib/notifications/event-labels";
import { getPlatformLabel } from "@/lib/platform-labels";
import { cn } from "@/lib/utils";

const iconWrap =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-neutral-0";

function sniffString(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function sniffNumber(data: Record<string, unknown>, key: string): number | null {
  const v = data[key];
  return typeof v === "number" ? v : null;
}

function sniffBoolean(data: Record<string, unknown>, key: string): boolean | null {
  const v = data[key];
  return typeof v === "boolean" ? v : null;
}

function sniffPlatform(data: Record<string, unknown>): string | null {
  // Returns the raw slug or merchant string. Callers wrap with
  // `getPlatformLabel()` so brand-specific casing (IHG, Macy's, JetBlue,
  // …) is applied consistently with the rest of the product.
  return sniffString(data, "platform") ?? sniffString(data, "merchant");
}

// Per-event-type humanized body builders. Each returns a sentence shaped
// from whatever data fields happen to be present, and degrades gracefully
// when context is missing. Builders return null only when no event-specific
// template applies — buildBody then falls through to the generic shape so
// new backend event types still render something useful before frontend
// catches up.
const EVENT_BODY_BUILDERS: Partial<
  Record<NotificationEventType, (data: Record<string, unknown>) => string | null>
> = {
  claim_drafted: (d) => {
    const platform = sniffPlatform(d);
    const itemTitle = sniffString(d, "item_title");
    if (platform && itemTitle) {
      return `Your ${getPlatformLabel(platform)} claim draft for ${itemTitle} is ready for review`;
    }
    if (platform) return `Your ${getPlatformLabel(platform)} claim draft is ready for review`;
    return "Your claim draft is ready for review";
  },
  claim_queued_auto: (d) => {
    const platform = sniffPlatform(d);
    if (platform) {
      return `Your ${getPlatformLabel(platform)} claim is queued and will be sent in 5 minutes`;
    }
    return "Your claim is queued and will be sent in 5 minutes";
  },
  claim_submitted: (d) => {
    const platform = sniffPlatform(d);
    if (platform) {
      return `Your ${getPlatformLabel(platform)} claim has been sent — we'll notify you when they respond`;
    }
    return "Your claim has been sent — we'll notify you when they respond";
  },
  claim_denied: (d) => {
    const platform = sniffPlatform(d);
    const reason = sniffString(d, "reason");
    if (platform && reason) {
      return `Your ${getPlatformLabel(platform)} claim was denied: ${reason}`;
    }
    if (platform) return `Your ${getPlatformLabel(platform)} claim was denied`;
    if (reason) return `Your claim was denied: ${reason}`;
    return "Your claim was denied";
  },
  claim_resolved_success: (d) => {
    const platform = sniffPlatform(d);
    const amount = sniffNumber(d, "amount_saved");
    if (platform && amount !== null) {
      return `Your ${getPlatformLabel(platform)} claim was approved — you saved ${formatUSD(amount)}`;
    }
    if (platform) return `Your ${getPlatformLabel(platform)} claim was approved`;
    if (amount !== null) return `Your claim was approved — you saved ${formatUSD(amount)}`;
    return "Your claim was approved";
  },
  price_dropped: (d) => {
    const platform = sniffPlatform(d);
    const itemTitle = sniffString(d, "item_title");
    const amount = sniffNumber(d, "amount_saved");
    const subject = itemTitle ?? "Your item";
    const parts: string[] = [`${subject} dropped in price`];
    if (platform) parts.push(`on ${getPlatformLabel(platform)}`);
    if (amount !== null) parts.push(`— save ${formatUSD(amount)}`);
    return parts.join(" ");
  },
  low_confidence_extract: (d) => {
    const itemTitle = sniffString(d, "item_title");
    if (itemTitle) return `We had trouble reading your ${itemTitle} receipt — please review`;
    return "We had trouble reading your receipt — please review";
  },
  consecutive_rejections: () => "Several recent claims were denied — let's review your strategy",
  first_time_dashboard: () => "Welcome to ClaimIt! Let's set up your first purchase to monitor",
  user_returned_after_long_absence: () => "Welcome back! Here's what you missed",
  // Resolver outcomes (BUG-82). Both `resolved` and `unresolved` flip copy
  // on `data.had_url`: when the user provided a URL we describe the action
  // as "verified" / "couldn't verify" rather than "found" / "couldn't find".
  // `corrected` implies the user URL was wrong by definition, so it always
  // takes the verified branch — no had_url check needed.
  product_url_resolved: (d) => {
    const platform = sniffPlatform(d);
    const hadUrl = sniffBoolean(d, "had_url") === true;
    if (hadUrl) {
      return platform
        ? `Your ${getPlatformLabel(platform)} product link has been verified — we'll start tracking the price`
        : "Your product link has been verified — we'll start tracking the price";
    }
    return platform
      ? `Your ${getPlatformLabel(platform)} product link is ready — we'll start tracking the price`
      : "Your product link is ready — we'll start tracking the price";
  },
  product_url_corrected: (d) => {
    const platform = sniffPlatform(d);
    return platform
      ? `Your ${getPlatformLabel(platform)} product link has been verified — we'll start tracking the price`
      : "Your product link has been verified — we'll start tracking the price";
  },
  product_url_unresolved: (d) => {
    const platform = sniffPlatform(d);
    const hadUrl = sniffBoolean(d, "had_url") === true;
    // Deliberately no "you can add/update it" tail: the resolver runs the
    // same search whether the user provides a URL or not, so promising a
    // user-driven remedy here would be misleading. The persistent "Add
    // product URL" affordance in the chart empty-state is the right place
    // to surface that option (search context, not failure context).
    if (hadUrl) {
      return platform
        ? `We couldn't verify the ${getPlatformLabel(platform)} link you provided`
        : "We couldn't verify the link you provided";
    }
    return platform
      ? `We couldn't find your ${getPlatformLabel(platform)} product link`
      : "We couldn't find your product link";
  },
};

// Per-event-type title overrides. EVENT_LABELS gives the category label
// used in the type-filter dropdown; per-card titles can vary by data when
// (as with product_url_resolved / product_url_unresolved) the same
// event_type rendered with different `data.had_url` deserves a different
// short label. Builders return null when the static EVENT_LABELS title is
// already correct; buildTitle falls back to EVENT_LABELS in that case.
const EVENT_TITLE_BUILDERS: Partial<
  Record<NotificationEventType, (data: Record<string, unknown>) => string | null>
> = {
  product_url_resolved: (d) =>
    sniffBoolean(d, "had_url") === true ? "Product link verified" : "Product link found",
  product_url_unresolved: (d) =>
    sniffBoolean(d, "had_url") === true ? "Product link invalid" : "Product link not found",
  // product_url_corrected: EVENT_LABELS already reads "Product link
  // verified" (the corrected scenario implies had_url=true by definition),
  // so no override needed.
};

export function buildTitle(notification: NotificationEvent): string {
  const data = notification.data ?? {};
  const builder = EVENT_TITLE_BUILDERS[notification.event_type];
  return builder?.(data) ?? EVENT_LABELS[notification.event_type];
}

export function buildBody(notification: NotificationEvent): string {
  const data = notification.data ?? {};
  const builder = EVENT_BODY_BUILDERS[notification.event_type];
  const custom = builder?.(data);
  if (custom) return custom;

  // Fallback: generic shape for event types we don't have a template for
  // yet. Keeps the row meaningful when the backend adds a new
  // NotificationEventType before the frontend catches up.
  const platform = sniffPlatform(data);
  const itemTitle = sniffString(data, "item_title");
  const amount = sniffNumber(data, "amount_saved");
  const reason = sniffString(data, "reason");
  const message = sniffString(data, "message");

  const parts: string[] = [];
  if (itemTitle) parts.push(itemTitle);
  if (platform) parts.push(`on ${getPlatformLabel(platform)}`);
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
  const title = buildTitle(notification);
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
