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
 * Now sources every field from the real `PurchaseDetailDoc` rather
 * than the mock `ConfirmExtractionPayload`. Children (form, banner,
 * receipt-preview) still consume their PR2-shape props here; B4–B6
 * each replace ONE child with a real-purchase-aware variant, so this
 * file becomes a thin pass-through after B6 lands.
 *
 * The inline adapters below intentionally keep the bridging logic
 * narrow and one-directional — every value lives on the doc, every
 * derivation is local, and there are no fallbacks to the mock.
 */

const PENDING_CONFIRMATION_THRESHOLD = 0.95;

/**
 * Map a confidence record to the form-field name set the banner
 * renders. Mirrors `_compute_low_confidence_fields` in
 * apps/ingest-agent/src/finalize.py: drop the `overall_min` /
 * `price` aggregates and any explicit null (null = not-applicable
 * for this purchase, NOT low-confidence).
 *
 * The FE additionally collapses `price` / `price_paid` to the form's
 * single "Purchase price" field — if either signal is low we surface
 * `price_paid` so the banner field names match the input the user
 * actually edits.
 */
function deriveLowConfidenceFields(confidence: PurchaseDetailDoc["extraction_confidence"]): {
  fields: string[];
  isMostlyFailed: boolean;
} {
  if (!confidence) return { fields: [], isMostlyFailed: false };

  const excluded = new Set(["overall_min", "price"]);
  const fields: string[] = [];
  let measured = 0;
  let low = 0;

  for (const [key, value] of Object.entries(confidence)) {
    if (excluded.has(key)) continue;
    if (value === null || value === undefined) continue;
    measured += 1;
    if (value < PENDING_CONFIRMATION_THRESHOLD) {
      low += 1;
      // `price_paid` and `price` map to the same field on the form.
      // If `price_paid` already surfaced we never re-add it for the
      // mirror score.
      if (!fields.includes(key)) fields.push(key);
    }
  }

  // Mostly-failed heuristic mirrors the PR2 banner threshold: an
  // overall_min < 0.3 OR more than half the measured fields below
  // the bar is the "couldn't extract most details" surface.
  const overall = confidence.overall_min ?? 0;
  const isMostlyFailed = overall < 0.3 && low >= Math.max(3, Math.ceil(measured / 2));

  return { fields, isMostlyFailed };
}

/**
 * Adapter: derive the receipt-preview props from the doc. The real
 * blob fetch lives in B6 — this adapter only provides the filename
 * (display only) and the FE's best guess at "is this a PDF or image"
 * derived from `ingestion_source`. B6 will replace the URL plumbing
 * with the authenticated proxy fetch.
 */
function adaptReceiptProps(purchase: PurchaseDetailDoc): {
  filename: string;
  receiptType: "pdf" | "image";
  receiptUrl: string;
} {
  const ingestion = purchase.ingestion_source ?? "upload_pdf";
  const receiptType: "pdf" | "image" = ingestion === "upload_pdf" ? "pdf" : "image";
  const fallbackName =
    receiptType === "pdf"
      ? "receipt.pdf"
      : ingestion === "upload_image"
        ? "receipt.jpg"
        : "receipt";
  // For now we surface the gs:// URL or empty string. The B6
  // receipt-preview rewrite owns turning this into a Blob via
  // `fetchReceiptBlob` and rendering with createObjectURL.
  return {
    filename: fallbackName,
    receiptType,
    receiptUrl: purchase.receipt_storage_url ?? "",
  };
}

export function ConfirmPurchaseContent({ purchase }: { purchase: PurchaseDetailDoc }) {
  const { fields: lowConfidenceFields, isMostlyFailed } = deriveLowConfidenceFields(
    purchase.extraction_confidence,
  );
  const receiptProps = adaptReceiptProps(purchase);
  const overallConfidence = purchase.extraction_confidence?.overall_min ?? 0;

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
          <div className="lg:w-2/5 shrink-0">
            <div className="lg:sticky lg:top-20">
              <ReceiptPreview
                filename={receiptProps.filename}
                receiptType={receiptProps.receiptType}
                receiptUrl={receiptProps.receiptUrl}
              />
            </div>
          </div>

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

      <ActionBar purchaseId={purchase._id} initialFormState={initialState} formState={formState} />
    </div>
  );
}
