"use client";

import { Check } from "lucide-react";
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
 * form. Each row links to `/confirm/<stagingKey>?line=<receipt_line_key>`,
 * which renders the existing confirm form pre-filled for that line; on
 * confirm the ActionBar creates a Purchase for the line, marks it tracked,
 * and routes back here so the user can pick more. Rows already tracked are
 * badged and dimmed.
 *
 * "Done" clears the stashed draft + tracked record and exits to the
 * dashboard — nothing else is persisted client-side (write-after-confirm).
 */
export function MultiItemSelection({ draft }: { draft: ConfirmDraftContext }) {
  const router = useRouter();
  const lines = (draft.extraction?.line_items ?? []) as UploadLineItem[];
  // Read once on mount — this component only renders client-side (the
  // loader sets the `selecting` state inside an effect), so sessionStorage
  // is available and there's no SSR/CSR hydration mismatch to guard.
  const [tracked] = useState<Set<string>>(() => readTrackedLineKeys(draft.stagingKey));

  const trackedCount = lines.filter((l) => tracked.has(l.receipt_line_key)).length;

  const handleDone = () => {
    clearUploadDraft(draft.stagingKey);
    clearTrackedLineKeys(draft.stagingKey);
    router.push("/dashboard");
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">
          We found {lines.length} items on this receipt
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Pick an item to review and start tracking it. You can come back and add the others too.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const isTracked = tracked.has(line.receipt_line_key);
          return (
            <li key={line.receipt_line_key}>
              <Link
                href={`/confirm/${draft.stagingKey}?line=${encodeURIComponent(
                  line.receipt_line_key,
                )}&from=/dashboard`}
                aria-label={`Review ${line.product_name ?? "item"}`}
                className={cn(
                  "flex min-h-20 items-center justify-between gap-4 rounded-lg border p-4 transition-colors",
                  isTracked
                    ? "border-neutral-200 bg-neutral-50"
                    : "border-neutral-200 hover:border-brand-primary-400 hover:bg-brand-primary-50",
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
                  <span className="text-sm font-semibold text-neutral-900">
                    {line.price_paid != null
                      ? formatPurchaseCurrency(line.price_paid, line.currency ?? "USD")
                      : "—"}
                  </span>
                  {isTracked ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="size-3" aria-hidden />
                      Tracked
                    </Badge>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {trackedCount > 0 ? `${trackedCount} of ${lines.length} tracked` : "Nothing tracked yet"}
        </p>
        <Button type="button" variant="outline" onClick={handleDone}>
          {trackedCount > 0 ? "Done" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
