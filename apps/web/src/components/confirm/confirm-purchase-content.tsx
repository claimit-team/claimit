"use client";

import { useMemo, useState } from "react";

import { ActionBar } from "@/components/confirm/action-bar";
import { ConfidenceBanner } from "@/components/confirm/confidence-banner";
import { ExtractionReviewForm } from "@/components/confirm/extraction-review-form";
import { MissingReceiptFallback, ReceiptPreview } from "@/components/confirm/receipt-preview";
import { WindowWarningBanner } from "@/components/confirm/window-warning-banner";
import { usePlatformPolicy } from "@/hooks/use-platform-policy";
import type { PurchaseDetailDoc } from "@/lib/api/purchases";
import { buildInitialFormState, type ConfirmFormState } from "@/lib/confirm-form-state";
import type { ConfirmDraftContext } from "@/lib/confirm-staging";

/**
 * Real-purchase confirm shell (ticket 5.14 B3).
 *
 * Sources every field from the real `PurchaseDetailDoc` (mock
 * `ConfirmExtractionPayload` was deleted in B10). Children (form,
 * banner, receipt-preview) consume the real shape directly via the
 * adapters below; each Bx commit (B4–B6) replaced ONE child with a
 * real-purchase-aware variant, so this
 * file becomes a thin pass-through after B6 lands.
 *
 * The inline adapters below intentionally keep the bridging logic
 * narrow and one-directional — every value lives on the doc, every
 * derivation is local, and there are no fallbacks to the mock.
 */

const PENDING_CONFIRMATION_THRESHOLD = 0.95;

/**
 * Map a confidence record to the form-field name set the banner +
 * form share. Mirrors `_compute_low_confidence_fields` in
 * apps/ingest-agent/src/finalize.py for the exclusion rules:
 *   - drop the `overall_min` aggregate;
 *   - drop any explicit null (null = not-applicable for this
 *     purchase, NOT low-confidence — e.g. retail rows carry null
 *     `member_price_at_purchase` confidence; counting that as low
 *     would surface a phantom amber banner).
 *
 * Output keys are FORM-FIELD IDs (`price_paid`, `product_name`,
 * `purchase_date`, `order_id`, `platform`, `category`,
 * `member_tier_at_purchase`) so the form's `isLow(field)` check
 * and the banner's label lookup both index off the same set. The
 * `price` aggregate is collapsed onto `price_paid` (same input on
 * the form) so the banner never lists "Purchase price" twice.
 */
export function deriveLowConfidenceFields(confidence: PurchaseDetailDoc["extraction_confidence"]): {
  fields: string[];
  isMostlyFailed: boolean;
} {
  if (!confidence) return { fields: [], isMostlyFailed: false };

  const rawLow: string[] = [];
  let measured = 0;

  for (const [key, value] of Object.entries(confidence)) {
    if (key === "overall_min") continue;
    if (value === null || value === undefined) continue;
    measured += 1;
    if (value < PENDING_CONFIRMATION_THRESHOLD) rawLow.push(key);
  }

  // Collapse `price` → `price_paid` (same form field) and dedupe.
  const fields: string[] = [];
  let pricePaidPushed = false;
  for (const key of rawLow) {
    if (key === "price" || key === "price_paid") {
      if (!pricePaidPushed) {
        fields.push("price_paid");
        pricePaidPushed = true;
      }
      continue;
    }
    if (!fields.includes(key)) fields.push(key);
  }

  // Mostly-failed heuristic mirrors the PR2 banner threshold: an
  // overall_min < 0.3 AND ≥3 low fields (or more than half the
  // measured non-null fields) lands the neutral "fill in manually"
  // surface instead of naming the long list of low fields.
  const overall = confidence.overall_min ?? 0;
  const halfMeasured = Math.max(3, Math.ceil(measured / 2));
  const isMostlyFailed = overall < 0.3 && fields.length >= halfMeasured;

  return { fields, isMostlyFailed };
}

/**
 * Best-effort filename for the receipt header (display only).
 * Parses the gs:// URI when present (the upload route encodes
 * `<purchaseId>.<ext>` after the user folder); otherwise falls back
 * to a generic name keyed off ingestion_source.
 */
function deriveReceiptFilename(purchase: PurchaseDetailDoc): string | null {
  const url = purchase.receipt_storage_url;
  if (url) {
    const tail = url.split("/").pop();
    if (tail) return tail;
  }
  if (purchase.ingestion_source === "upload_pdf") return "receipt.pdf";
  if (purchase.ingestion_source === "upload_image") return "receipt.jpg";
  return null;
}

export function ConfirmPurchaseContent({
  purchase,
  draft,
}: {
  purchase: PurchaseDetailDoc;
  /**
   * Present for the write-after-confirm upload flow — the purchase has
   * not been persisted yet. The receipt blob can't be proxied via
   * `/purchases/:id/receipt` until confirm, so the column shows a
   * "will be attached" note; ActionBar creates the doc on confirm.
   */
  draft?: ConfirmDraftContext;
}) {
  const { fields: lowConfidenceFields, isMostlyFailed } = deriveLowConfidenceFields(
    purchase.extraction_confidence,
  );
  const receiptFilename = deriveReceiptFilename(purchase);
  const overallConfidence = purchase.extraction_confidence?.overall_min ?? 0;
  // We ALWAYS reserve the left column. Pre-fix, a `receipt_storage_url
  // === null` doc (Gmail seed row, future no-screenshot path) collapsed
  // the column entirely and stretched the form full-width — which
  // silently omitted any "this purchase has no original" affordance.
  // Now: when there's a stored receipt the column mounts ReceiptPreview
  // (it owns the loading / authenticated-blob-fetch dance); when there
  // isn't, we render the compact "Original receipt not available"
  // fallback directly so the user still sees source context next to
  // the form they're being asked to confirm.
  // For an upload draft the blob exists in GCS but no purchase doc backs
  // the `/purchases/:id/receipt` proxy yet, so we never mount ReceiptPreview
  // pre-confirm — the draft fallback note covers it.
  const hasReceipt = !draft && purchase.receipt_storage_url !== null;

  // Form state lives here (ticket 5.14 B4). The form is purely
  // controlled and ActionBar reads the same state object to compute
  // the `corrected_fields` diff at submit time.
  //
  // `initialState` is the snapshot we diff against — it stays
  // stable for the lifetime of the page. `purchase._id` is keyed
  // into the useMemo dep so a route-level remount with a new id
  // rebuilds the snapshot from the new doc.
  const initialState = useMemo<ConfirmFormState>(() => buildInitialFormState(purchase), [purchase]);
  const [formState, setFormState] = useState<ConfirmFormState>(initialState);

  // BUG-59: reactive policy lookup so the out-of-window banner stays in sync
  // with edits to platform / purchase_date / member_tier on the form.
  const { policy, loading: policyLoading } = usePlatformPolicy(formState.platform);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">Review purchase details</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Confirm the extracted information before ClaimIt starts monitoring.
          </p>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="lg:w-2/5 shrink-0">
            <div className="lg:sticky lg:top-20">
              {hasReceipt ? (
                <ReceiptPreview
                  purchaseId={purchase._id}
                  filename={receiptFilename}
                  ingestionSource={purchase.ingestion_source}
                />
              ) : (
                // Same outer card chrome as ReceiptPreview so the
                // column reads as "the receipt area" even when there
                // isn't one — keeps the visual rhythm of the page
                // consistent between the two states.
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
                  <MissingReceiptFallback
                    ingestionSource={purchase.ingestion_source}
                    variant="compact"
                    {...(draft
                      ? {
                          title: "Receipt ready to attach",
                          body: "Your uploaded receipt is saved and will be attached to this purchase when you confirm.",
                        }
                      : {})}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-6">
              <div className="mb-6 space-y-3">
                <ConfidenceBanner
                  overallConfidence={overallConfidence}
                  lowConfidenceFields={lowConfidenceFields}
                  isMostlyFailed={isMostlyFailed}
                />
                <WindowWarningBanner
                  platform={formState.platform}
                  purchaseDate={formState.purchaseDate}
                  memberTier={formState.memberTier}
                  policy={policy}
                  policyLoading={policyLoading}
                />
              </div>
              <ExtractionReviewForm
                state={formState}
                onChange={setFormState}
                lowConfidenceFields={lowConfidenceFields}
              />
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        purchase={purchase}
        initialFormState={initialState}
        formState={formState}
        draft={draft}
      />
    </div>
  );
}
