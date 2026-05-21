"use client";

import { ActionBar } from "@/components/confirm/action-bar";
import { ConfidenceBanner } from "@/components/confirm/confidence-banner";
import { ExtractionReviewForm } from "@/components/confirm/extraction-review-form";
import { ReceiptPreview } from "@/components/confirm/receipt-preview";
import type { PurchaseDetailDoc } from "@/lib/api/purchases";
import type { ExtractionField, PurchaseCategory } from "@/lib/mock-purchases";

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
 * Adapter: shape a real `PurchaseDetailDoc` into the old
 * `initialData` prop the B4 form will eventually own directly.
 *
 * `confidence ?? 0` is used because the form's mock contract carried
 * a number; once B4 lifts state up + replaces the prop shape the
 * confidence value on each field disappears entirely (the banner is
 * the single source of truth for low-confidence highlighting).
 */
function adaptFormInitialData(purchase: PurchaseDetailDoc): {
  platform: ExtractionField<string>;
  product_name: ExtractionField<string>;
  price_paid: ExtractionField<number>;
  purchase_date: ExtractionField<string>;
  order_id: ExtractionField<string>;
  category: PurchaseCategory;
} {
  const conf = purchase.extraction_confidence;
  const category: PurchaseCategory =
    purchase.category === "airline" || purchase.category === "hotel" ? purchase.category : "retail";
  return {
    platform: { value: purchase.platform ?? "", confidence: conf?.platform ?? 0 },
    product_name: { value: purchase.product_name ?? "", confidence: conf?.product_name ?? 0 },
    price_paid: { value: purchase.price_paid ?? 0, confidence: conf?.price_paid ?? 0 },
    purchase_date: {
      value: purchase.purchase_date ? purchase.purchase_date.slice(0, 10) : "",
      confidence: conf?.purchase_date ?? 0,
    },
    order_id: { value: purchase.order_id ?? "", confidence: conf?.order_id ?? 0 },
    category,
  };
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
  const initialData = adaptFormInitialData(purchase);
  const receiptProps = adaptReceiptProps(purchase);
  const overallConfidence = purchase.extraction_confidence?.overall_min ?? 0;

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
                initialData={initialData}
                lowConfidenceFields={lowConfidenceFields}
              />
            </div>
          </div>
        </div>
      </div>

      <ActionBar purchaseId={purchase._id} />
    </div>
  );
}
