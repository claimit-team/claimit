"use client";

import { AlertTriangle } from "lucide-react";

import { isOutsideWindow, type PolicyWindowDoc } from "@/lib/policy-window";
import { safePlatformLabel } from "@/lib/purchase-detail-view";

/**
 * Out-of-window warning surface for the confirm page (BUG-59).
 *
 * Reads the live form state (`platform`, `purchaseDate`, `memberTier`)
 * + the policy fetched by `usePlatformPolicy` and renders an amber
 * banner when the chosen purchase date is already past the platform's
 * price-protection window. Purely informational — the Confirm CTA
 * remains submittable so the user can still start monitoring on a
 * known-ineligible purchase if they choose (matches the ticket).
 *
 * Renders nothing when the inputs aren't yet ready to compute (no
 * platform, no date, policy still loading) so the banner doesn't
 * flicker as the user fills the form.
 */

interface WindowWarningBannerProps {
  platform: string;
  purchaseDate: Date | null;
  memberTier: string;
  policy: PolicyWindowDoc | null;
  policyLoading: boolean;
}

export function WindowWarningBanner({
  platform,
  purchaseDate,
  memberTier,
  policy,
  policyLoading,
}: WindowWarningBannerProps) {
  if (platform === "" || purchaseDate === null || policyLoading) return null;

  const { outside, windowDays } = isOutsideWindow({
    purchaseDate,
    policy,
    memberTier: memberTier.trim() || null,
  });
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
          Confirming will start monitoring but no claim can be filed.
        </p>
      </div>
    </div>
  );
}
