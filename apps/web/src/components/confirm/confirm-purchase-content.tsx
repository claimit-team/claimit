"use client";

import { useMemo, useState } from "react";

import { ActionBar } from "@/components/confirm/action-bar";
import { ConfidenceBanner } from "@/components/confirm/confidence-banner";
import { ExtractionReviewForm } from "@/components/confirm/extraction-review-form";
import { ReceiptPreview } from "@/components/confirm/receipt-preview";
import type { PurchaseDetailDoc } from "@/lib/api/purchases";
import { buildInitialFormState, type ConfirmFormState } from "@/lib/confirm-form-state";

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
function deriveLowConfidenceFields(confidence: PurchaseDetailDoc["extraction_confidence"]): {
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

export function ConfirmPurchaseContent({ purchase }: { purchase: PurchaseDetailDoc }) {
  const { fields: lowConfidenceFields, isMostlyFailed } = deriveLowConfidenceFields(
    purchase.extraction_confidence,
  );
  const receiptFilename = deriveReceiptFilename(purchase);
  const overallConfidence = purchase.extraction_confidence?.overall_min ?? 0;
  // No stored receipt → render the form full-width below the page
  // header rather than reserving a 2/5 column for the "Original not
  // available" fallback. The fallback still surfaces for upload-
  // source docs whose blob 404s (degraded state); only the explicit
  // null-url shape (e.g. the gmail seed row) goes full-width.
  const hasReceipt = purchase.receipt_storage_url !== null;

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
          {hasReceipt ? (
            <div className="lg:w-2/5 shrink-0">
              <div className="lg:sticky lg:top-20">
                <ReceiptPreview
                  purchaseId={purchase._id}
                  filename={receiptFilename}
                  ingestionSource={purchase.ingestion_source}
                />
              </div>
            </div>
          ) : null}

          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-6">
              <div className="mb-6">
                <ConfidenceBanner
                  overallConfidence={overallConfidence}
                  lowConfidenceFields={lowConfidenceFields}
                  isMostlyFailed={isMostlyFailed}
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

      <ActionBar purchase={purchase} initialFormState={initialState} formState={formState} />
    </div>
  );
}
