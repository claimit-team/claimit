"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { PurchaseDetailMonitoringStatus } from "@/lib/purchase-detail-view";

interface RefundEligibilityCardProps {
  status: PurchaseDetailMonitoringStatus;
  /** `null` when `window_expires` is missing/malformed. */
  daysRemaining: number | null;
  /** `null` when the wire doc lacks both `purchase_date` and
   * `ingested_at`. */
  purchaseDate: string | null;
  /** `null` when `window_expires` is missing. */
  windowEndDate: string | null;
  policySummary: string;
}

/**
 * Short, calm placeholder rendered when the wire doc is missing the
 * dates needed to compute the refund window. The math here is genuinely
 * unknown — we MUST NOT substitute "today" for the start or fabricate
 * a fictional end date (review finding C6).
 */
function UnknownWindowBlock() {
  return (
    <p className="text-neutral-500 text-sm">
      Window dates aren't available for this purchase yet — refund-eligibility math will surface
      once the receipt is fully parsed.
    </p>
  );
}

export function RefundEligibilityCard({
  status,
  daysRemaining,
  purchaseDate,
  windowEndDate,
  policySummary,
}: RefundEligibilityCardProps) {
  const isActive =
    status === "monitoring" || status === "eligible_drop" || status === "claim_active";

  // Math short-circuit (review finding C6): if EITHER endpoint of the
  // window is unknown the days-remaining + progress bar are not
  // meaningful. Render the placeholder instead — never compute against
  // a substitute date.
  const hasWindow =
    purchaseDate !== null &&
    windowEndDate !== null &&
    daysRemaining !== null &&
    !Number.isNaN(new Date(purchaseDate).getTime()) &&
    !Number.isNaN(new Date(windowEndDate).getTime());

  let progressValue = 0;
  let isNearExpiration = false;
  if (hasWindow) {
    const windowStart = new Date(purchaseDate);
    const windowEnd = new Date(windowEndDate);
    const now = new Date();
    const totalDays = Math.ceil(
      (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const elapsed = Math.ceil((now.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24));
    progressValue = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 0;
    isNearExpiration = (daysRemaining as number) <= 5 && isActive;
  }

  return (
    <Card className="bg-neutral-0">
      <CardHeader>
        <CardTitle className="font-semibold text-lg text-neutral-900">Refund eligibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasWindow ? (
          <>
            <p className="text-neutral-700 text-sm">
              {isActive ? (
                <>
                  Active monitoring —{" "}
                  <span
                    className={
                      isNearExpiration ? "font-medium text-semantic-warning" : "font-medium"
                    }
                  >
                    {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
                  </span>{" "}
                  in price match window
                </>
              ) : (
                <>
                  Closed — 30-day window ended on{" "}
                  {new Date(windowEndDate as string).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </>
              )}
            </p>

            <div className="space-y-2">
              <Progress
                value={progressValue}
                className={isNearExpiration ? "[&>div]:bg-semantic-warning" : ""}
              />
              <div className="flex justify-between text-neutral-500 text-xs">
                <span>
                  {new Date(purchaseDate as string).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span>
                  {new Date(windowEndDate as string).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          </>
        ) : (
          <UnknownWindowBlock />
        )}

        <blockquote className="border-neutral-200 border-l-2 pl-4 text-neutral-700 text-sm italic">
          {policySummary}
        </blockquote>

        <Dialog>
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 px-0 text-brand-primary-500 hover:text-brand-primary-500/80"
              />
            }
          >
            <ExternalLink className="size-4" />
            Read full policy
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Price Match Policy</DialogTitle>
              <DialogDescription>Best Buy Price Match Guarantee</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-neutral-700 text-sm">
              <p>
                At Best Buy, we offer price matching on qualifying products. If you find a lower
                price on an identical item at a qualifying retailer, we&apos;ll match the price at
                the time of purchase or within 15 days of purchase.
              </p>
              <h4 className="font-medium text-neutral-900">Eligibility Requirements:</h4>
              <ul className="list-inside list-disc space-y-1 text-neutral-700">
                <li>Product must be identical (same brand, model number, and color)</li>
                <li>Product must be in stock and available for sale</li>
                <li>Price match must be requested within 30 days of purchase</li>
                <li>Original receipt or order confirmation required</li>
              </ul>
              <h4 className="font-medium text-neutral-900">Exclusions:</h4>
              <ul className="list-inside list-disc space-y-1 text-neutral-700">
                <li>Marketplace sellers and third-party sellers</li>
                <li>Open-box, clearance, or refurbished items</li>
                <li>Bundle deals or promotional pricing</li>
                <li>Membership-only pricing</li>
              </ul>
              <p className="text-neutral-500 text-xs">
                This is a simplified summary. Please refer to Best Buy&apos;s official policy for
                complete terms.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
