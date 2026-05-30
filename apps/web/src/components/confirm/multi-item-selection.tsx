"use client";

import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UploadLineItem } from "@/lib/api/purchases";
import {
  type ConfirmDraftContext,
  clearTrackedLineKeys,
  clearUploadDraft,
  readTrackedLineKeys,
} from "@/lib/confirm-staging";
import { formatPurchaseCurrency } from "@/lib/purchase-detail-view";
import { cn } from "@/lib/utils";

/**
 * Item picker for a multi-item receipt upload.
 *
 * When the extractor finds more than one purchasable line on an uploaded
 * receipt, the confirm loader renders this list instead of the single-item
 * form. The user confirms items ONE AT A TIME: tapping a row opens that
 * line's confirm form (`/confirm/<key>?line=<k>`), where pressing
 * "Confirm" creates the Purchase (write-after-confirm via `createPurchase`
 * in `ActionBar`), marks the line tracked in sessionStorage, and returns
 * here so the next item can be added.
 *
 * Why per-item instead of a batch checkbox select: an earlier checkbox
 * design lost its selection when the user opened a row to review it and
 * hit Back (the list remounts and transient `selected` state is gone).
 * Committing each item through its own confirm makes "tracked" durable
 * (it lives in sessionStorage, read back on every remount via
 * `readTrackedLineKeys`) — there's no transient selection to lose, and
 * every tracked item went through the same review-then-confirm path as a
 * single-item upload.
 *
 * The list is purely navigational now: untracked rows are buttons that
 * route to the per-line confirm; tracked rows badge in place and are no
 * longer actionable. "Done" / "Cancel" clears the stashed draft + tracked
 * record and exits (to /purchases if anything was tracked, else the
 * dashboard).
 */
export function MultiItemSelection({ draft }: { draft: ConfirmDraftContext }) {
  const router = useRouter();
  const lines = (draft.extraction?.line_items ?? []) as UploadLineItem[];
  // Seeded from sessionStorage so returning from a per-line confirm shows
  // the items already tracked. This component remounts on every round-trip
  // (the loader flips between `ready` and `selecting`), so the initializer
  // re-reads the latest tracked set each time — no in-place mutation needed.
  const [tracked] = useState<Set<string>>(() => readTrackedLineKeys(draft.stagingKey));

  const trackedCount = lines.filter((l) => tracked.has(l.receipt_line_key)).length;

  const handleDone = () => {
    clearUploadDraft(draft.stagingKey);
    clearTrackedLineKeys(draft.stagingKey);
    // Land on the list of newly-monitored purchases when something was
    // tracked; otherwise the user backed out entirely — return to the dash.
    router.push(trackedCount > 0 ? "/purchases" : "/dashboard");
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">
          We found {lines.length} items on this receipt
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Tap an item to review and confirm it — each one starts monitoring right away. Add as many
          as you like, then tap Done.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const isTracked = tracked.has(line.receipt_line_key);
          const price =
            line.price_paid != null
              ? formatPurchaseCurrency(line.price_paid, line.currency ?? "USD")
              : "—";

          if (isTracked) {
            return (
              <li key={line.receipt_line_key}>
                <div className="flex min-h-20 items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {line.product_name ?? "Item"}
                    </p>
                    {line.variant ? (
                      <p className="truncate text-xs text-neutral-500">{line.variant}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-neutral-900">{price}</span>
                    <Badge variant="secondary" className="gap-1">
                      <Check className="size-3" aria-hidden />
                      Tracked
                    </Badge>
                  </div>
                </div>
              </li>
            );
          }

          // The whole row is the button: tapping it opens this line's
          // confirm form, where Confirm tracks it and returns here.
          return (
            <li key={line.receipt_line_key}>
              <Link
                href={`/confirm/${draft.stagingKey}?line=${encodeURIComponent(
                  line.receipt_line_key,
                )}`}
                aria-label={`Review ${line.product_name ?? "item"}`}
                className={cn(
                  "flex min-h-20 items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 text-left transition-colors",
                  "hover:border-brand-primary-400 hover:bg-brand-primary-50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {line.product_name ?? "Item"}
                  </p>
                  {line.variant ? (
                    <p className="truncate text-xs text-neutral-500">{line.variant}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-neutral-900">{price}</span>
                  <ChevronRight className="size-5 text-neutral-400" aria-hidden />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-500">
          {trackedCount > 0 ? `${trackedCount} of ${lines.length} tracked` : "Nothing tracked yet"}
        </p>
        <Button
          type="button"
          onClick={handleDone}
          className={cn(
            trackedCount > 0 && "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
          )}
          variant={trackedCount > 0 ? "default" : "outline"}
        >
          {trackedCount > 0 ? "Done" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
