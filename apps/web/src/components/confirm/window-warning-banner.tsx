"use client";

import { AlertTriangle } from "lucide-react";

import { safePlatformLabel } from "@/lib/purchase-detail-view";

/**
 * Out-of-window warning surface for the confirm page (BUG-59).
 *
 * Driven by the parent's `outside` decision (`outsideWindow` in
 * confirm-purchase-content) rather than recomputing the window itself, so the
 * banner and the disabled Confirm CTA can never disagree. That decision is
 * already path-aware: it stays false for the confirm path when no Policy
 * exists (the backend leaves the window untouched and does NOT 409 there), and
 * true for the upload-draft path (the backend uses a 15-day default and will
 * 409 on a past window).
 *
 * When shown, the Confirm CTA is disabled (ActionBar) and the backend rejects
 * the submit with 409 `window_expired` — a past-window purchase can no longer
 * be monitored, so the user is steered to Dismiss (or, on the upload-draft
 * path, to Cancel/discard, since there is no Dismiss control there).
 */

interface WindowWarningBannerProps {
  platform: string;
  /** Parent's gated decision — true only when monitoring is actually blocked. */
  outside: boolean;
  /** Applicable price-protection window length, for the message copy. */
  windowDays: number;
  /** Upload-draft flow has no Dismiss control — steer to Cancel instead. */
  isDraft: boolean;
}

export function WindowWarningBanner({
  platform,
  outside,
  windowDays,
  isDraft,
}: WindowWarningBannerProps) {
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
          It can no longer be monitored — no claim could be filed.{" "}
          {isDraft ? "Cancel to discard it." : "Dismiss it instead."}
        </p>
      </div>
    </div>
  );
}
