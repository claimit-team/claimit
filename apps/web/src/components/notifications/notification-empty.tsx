"use client";

import { BellRing } from "lucide-react";

export function NotificationEmpty({
  headline = "You're all caught up",
  caption = "When claims, purchases, or the assistant ping you, they show up here.",
}: {
  headline?: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-8 py-16 text-center">
      <BellRing className="h-12 w-12 text-neutral-300 mb-4" aria-hidden />
      <h2 className="text-lg font-semibold text-neutral-900">{headline}</h2>
      <p className="mt-2 max-w-md text-sm text-neutral-600">{caption}</p>
    </div>
  );
}
