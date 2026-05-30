"use client";

import { AlertTriangle } from "lucide-react";

import { safePlatformLabel } from "@/lib/purchase-detail-view";

/**
 * Out-of-window warning surface for the confirm + re-upload pages (BUG-59).
 *
 * Driven by the parent's `outside` decision rather than recomputing the window
 * itself, so the banner and the disabled submit CTA can never disagree. Each
 * caller computes `outside` to match its backend seam — e.g. the confirm path
 * leaves `outside` false when no Policy exists (the server doesn't 409 there),
 * while the upload-draft path blocks on the 15-day default.
 *
 * Copy is intentionally factual (no "dismiss"/"cancel" steering): the action
 * differs per surface (Dismiss on confirm, Cancel on an upload draft, fix the
 * date on re-upload) and is already conveyed by the visible controls + the
 * disabled submit button, so the banner shouldn't hard-code one of them.
 */

interface WindowWarningBannerProps {
  platform: string;
  /** Parent's gated decision — true only when monitoring is actually blocked. */
  outside: boolean;
  /** Applicable price-protection window length, for the message copy. */
  windowDays: number;
}

export function WindowWarningBanner({ platform, outside, windowDays }: WindowWarningBannerProps) {
  if (!outside) return null;

  const label = safePlatformLabel(platform);

  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg bg-semantic-warning-bg p-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-semantic-warning" aria-hidden />
      <div>
        <p className="text-sm font-medium text-neutral-700">
          This purchase is outside {label}&apos;s {windowDays}-day price protection window
        </p>
        <p className="mt-0.5 text-sm text-neutral-500">
          It can no longer be monitored — no claim could be filed.
        </p>
      </div>
    </div>
  );
}
