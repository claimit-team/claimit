"use client";

import { ArrowLeft, StopCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback } from "react";

import { PlatformLogo } from "@/components/claims/platform-logo";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
// Note: `Button` is used in the back-nav arrow. `buttonVariants` styles
// the disabled tooltip buttons + the View-claim links.
import {
  formatPurchaseDate,
  type PurchaseCategory,
  type PurchaseDetailMonitoringStatus,
} from "@/lib/purchase-detail-view";
import { getMonitoringStatusBadge } from "@/lib/purchase-status";
import { cn } from "@/lib/utils";

export interface PurchasePageHeaderModel {
  productTitle: string;
  monitoringStatus: PurchaseDetailMonitoringStatus;
  /** Display label (e.g. "Best Buy"). */
  platform: string;
  /** Raw backend platform slug (e.g. "best_buy") — drives `PlatformLogo`'s
   * brand-asset lookup. */
  platformRaw: string | null;
  category: PurchaseCategory;
  /** Raw backend category — drives `PlatformLogo`'s fallback icon. */
  categoryRaw: string | null;
  purchaseDate: string;
  orderId: string;
  primaryRelatedClaimId?: string;
}

interface PurchasePageHeaderProps {
  purchase: PurchasePageHeaderModel;
}

/**
 * Disabled-action tooltip copy. Both "Stop monitoring" and "Re-upload
 * receipt" are intentionally disabled in PR 1 (decision 3 in the
 * review):
 *
 *   - "Stop monitoring" does NOT shoehorn into POST /purchases/:id/dismiss
 *     because the dismiss reason enum is `not_an_order | duplicate |
 *     other` (no `user_dismissed` value) and dismiss carries a
 *     "this was misidentified" semantic, NOT the "I'm done watching this"
 *     semantic the stop button advertises. A future dedicated endpoint
 *     is the right home (TODO).
 *
 *   - "Re-upload receipt" lives in the 5.13 receipt-upload flow; once
 *     that ticket lands the button can wire into it.
 *
 * Showing these visibly-disabled (with explanatory tooltips) is
 * preferred over hiding them — preserves spatial expectation for the
 * v0-prompt header and surfaces upcoming functionality.
 */
const STOP_MONITORING_TODO =
  "Coming soon. A dedicated 'stop monitoring' endpoint is on the roadmap; the dismiss endpoint has a different semantic and isn't wired here.";
const REUPLOAD_TODO = "Coming soon. The receipt re-upload flow will ship alongside ticket 5.13.";

export function PurchasePageHeader({ purchase }: PurchasePageHeaderProps) {
  const router = useRouter();

  const statusBadge = getMonitoringStatusBadge(purchase.monitoringStatus);

  // Back-nav per decision 7 in the review: router.back() works in-app,
  // but a direct URL / fresh tab has no history to pop. Fall back to
  // the list page so the arrow is NEVER a no-op.
  //
  // `window.history.length` includes the current entry — a fresh tab
  // starts at 1 (just this page), an in-app push has 2+. The
  // boundary is `> 1` to detect "we have somewhere to go back to".
  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/purchases");
    }
  }, [router]);

  const primaryClaimHref = purchase.primaryRelatedClaimId
    ? `/claims/${purchase.primaryRelatedClaimId}`
    : null;

  const renderActions = () => {
    switch (purchase.monitoringStatus) {
      case "monitoring":
        return (
          <div className="flex flex-col gap-2 sm:flex-row">
            <DisabledTooltipButton
              label="Stop monitoring"
              icon={<StopCircle className="size-4" />}
              tooltip={STOP_MONITORING_TODO}
              variant="ghost"
            />
            <DisabledTooltipButton
              label="Re-upload receipt"
              icon={<Upload className="size-4" />}
              tooltip={REUPLOAD_TODO}
              variant="outline"
            />
          </div>
        );

      case "eligible_drop":
        if (primaryClaimHref === null) return null;
        return (
          <Link
            href={primaryClaimHref}
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5 px-2.5")}
          >
            View draft claim
          </Link>
        );

      case "claim_active":
      case "claim_resolved":
        if (primaryClaimHref === null) return null;
        return (
          <Link
            href={primaryClaimHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            View claim
          </Link>
        );

      case "window_expired":
      case "stopped":
        return (
          <DisabledTooltipButton
            label="Re-upload"
            icon={<Upload className="size-4" />}
            tooltip={REUPLOAD_TODO}
            variant="outline"
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={handleBack}
          className="size-8 shrink-0"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2 text-neutral-500 text-sm"
        >
          <Link href="/purchases" className="shrink-0 hover:text-neutral-900">
            Purchases
          </Link>
          <span aria-hidden className="shrink-0">
            /
          </span>
          <span className="truncate font-medium text-neutral-900">{purchase.productTitle}</span>
        </nav>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <PlatformLogo platform={purchase.platformRaw} category={purchase.categoryRaw} />
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-semibold text-2xl text-neutral-900">{purchase.productTitle}</h1>
              <Badge variant="outline" className={cn("shrink-0", statusBadge.className)}>
                {statusBadge.label}
              </Badge>
            </div>
            <p className="text-neutral-500 text-sm">
              {purchase.platform} ·{" "}
              {`${purchase.category.charAt(0).toUpperCase()}${purchase.category.slice(1)}`} ·
              Purchased {formatPurchaseDate(purchase.purchaseDate)} · Order {purchase.orderId}
            </p>
          </div>
        </div>

        <div className="shrink-0">{renderActions()}</div>
      </div>
    </div>
  );
}

/**
 * Disabled button + tooltip pair for header write actions that aren't
 * wired yet (decision 3 in the PR review).
 *
 * Why a custom component vs inlining: a `disabled` button receives no
 * pointer events in some browsers, which would also kill the hover
 * tooltip. base-ui's TooltipTrigger handles the pointer-events fix
 * internally, so making the trigger itself the disabled button (via
 * `render` of a real `<Button>`) gets the right behavior in one place.
 */
function DisabledTooltipButton({
  label,
  icon,
  tooltip,
  variant,
}: {
  label: string;
  icon: ReactNode;
  tooltip: string;
  variant: "ghost" | "outline";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        disabled
        aria-disabled
        aria-label={`${label} (coming soon)`}
        className={cn(buttonVariants({ variant, size: "sm" }), "gap-1.5")}
      >
        {icon}
        {label}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
