"use client";

import { BotMessageSquare, FileText, Receipt, Zap } from "lucide-react";
import type { NotificationEventType } from "@/lib/mock-notifications";
import { cn } from "@/lib/utils";

const iconWrap =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-neutral-0";

export function NotificationRow({
  title,
  description,
  timeLabel,
  eventType,
}: {
  title: string;
  description: string;
  timeLabel: string;
  eventType: NotificationEventType;
}) {
  const icon =
    eventType === "claim" ? (
      <FileText className="h-4 w-4 text-brand-primary-600" aria-hidden />
    ) : eventType === "purchase" ? (
      <Receipt className="h-4 w-4 text-semantic-warning" aria-hidden />
    ) : eventType === "assistant" ? (
      <BotMessageSquare className="h-4 w-4 text-violet-600" aria-hidden />
    ) : (
      <Zap className="h-4 w-4 text-neutral-600" aria-hidden />
    );

  return (
    <article
      className={cn(
        "flex gap-4 border-b border-neutral-100 px-4 py-4 transition-colors hover:bg-neutral-50/90 sm:px-6",
      )}
    >
      <div className={cn(iconWrap, "border-neutral-200")}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 justify-between">
          <h3 className="font-medium text-neutral-900 leading-snug">{title}</h3>
          <time className="shrink-0 text-xs tabular-nums text-neutral-500">{timeLabel}</time>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600">{description}</p>
      </div>
    </article>
  );
}
