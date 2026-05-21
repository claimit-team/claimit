"use client";

import { ArrowLeft, StopCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
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
  /** When true and `monitoringStatus === "monitoring"`, a small amber
   * indicator + tooltip surfaces beside the badge. Maps to backend
   * `status === "monitoring_degraded"` (v0 prompt §1). */
  monitoringDegraded: boolean;
  /** Display label (e.g. "Best Buy"). */
  platform: string;
  /** Raw backend platform slug (e.g. "best_buy") — drives `PlatformLogo`'s
   * brand-asset lookup. */
  platformRaw: string | null;
  category: PurchaseCategory;
  /** Raw backend category — drives `PlatformLogo`'s fallback icon. */
  categoryRaw: string | null;
  /** `null` when the wire doc has neither `purchase_date` nor
   * `ingested_at`. Rendered as the `formatPurchaseDate` placeholder. */
  purchaseDate: string | null;
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

  // Back-nav fallback (locked decision #7: arrow MUST never be a no-op).
  //
  // Mechanism choice: we use `document.referrer` instead of
  // `window.history.length` / `history.state?.idx`. Both alternatives
  // are unreliable in Next 16's App Router — `history.length` is
  // consistently 2 on a fresh tab (Next replaces state on every
  // render), and `history.state.idx` is a Pages-Router-only field that
  // Next 16 App Router NEVER writes (state shape is strictly
  // `{__NA, __PRIVATE_NEXTJS_INTERNALS_TREE}`). Verified against
  // `next/dist/esm/client/components/app-router.js` in this repo.
  //
  // Same-origin referrer ⇒ user came from inside the app this tab,
  //   `router.back()` lands on a real Claimit page.
  // Empty / cross-origin referrer ⇒ direct URL paste, email link, or
  //   fresh tab. Push the list page so the arrow has somewhere to go.
  const handleBack = useCallback(() => {
    if (typeof window === "undefined") return;
    let sameOrigin = false;
    const referrer = document.referrer;
    if (referrer !== "") {
      try {
        sameOrigin = new URL(referrer).origin === window.location.origin;
      } catch {
        sameOrigin = false;
      }
    }
    if (sameOrigin) {
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
                {/* Degraded indicator (v0 prompt §1): a single amber dot
                    inside the "Monitoring" badge tells the user the
                    monitor sweep is partially failing. Contained — no
                    surrounding layout changes. Only surfaces when the
                    backend signals `monitoring_degraded` AND the UI is
                    in the "monitoring" state (any other state already
                    encodes its own resolution). */}
                {purchase.monitoringDegraded && purchase.monitoringStatus === "monitoring" ? (
                  <DegradedIndicator />
                ) : null}
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
 * Minimal degraded indicator (v0 prompt §1): an amber dot inline with
 * the "Monitoring" badge label, with a tooltip explaining what the dot
 * means. Self-contained so it can be slotted into the Badge without
 * altering surrounding layout.
 */
function DegradedIndicator() {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label="Monitoring partially degraded"
        className="-mr-0.5 ml-1 inline-flex size-2 shrink-0 items-center justify-center rounded-full bg-semantic-warning align-middle outline-none focus-visible:ring-2 focus-visible:ring-semantic-warning/40"
      />
      <TooltipContent>
        Monitoring is partially degraded — the last price check didn't return data. ClaimIt will
        retry automatically.
      </TooltipContent>
    </Tooltip>
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
  // Accessibility (review C3): a real `disabled` button is not
  // tab-focusable, so keyboard users would never see the "coming soon"
  // tooltip that explains why the action is unavailable. Render a
  // focusable button with `aria-disabled` instead, and block click /
  // Enter / Space activation manually so the control stays inert.
  const blockMouse = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const blockKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-disabled="true"
        tabIndex={0}
        aria-label={`${label} (coming soon)`}
        onClick={blockMouse}
        onKeyDown={blockKeyboard}
        className={cn(
          buttonVariants({ variant, size: "sm" }),
          "cursor-not-allowed gap-1.5 opacity-50",
        )}
      >
        {icon}
        {label}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
