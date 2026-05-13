"use client";

import { ActionBar } from "@/components/confirm/action-bar";
import { ConfidenceBanner } from "@/components/confirm/confidence-banner";
import { ExtractionReviewForm } from "@/components/confirm/extraction-review-form";
import { ReceiptPreview } from "@/components/confirm/receipt-preview";
import type { ConfirmExtractionPayload } from "@/lib/mock-purchases";

export function ConfirmPurchaseContent({
  purchaseId,
  extraction,
}: {
  purchaseId: string;
  extraction: ConfirmExtractionPayload;
}) {
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
                filename={extraction.filename}
                receiptType={extraction.receipt_type}
                receiptUrl={extraction.receipt_url}
              />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-6">
              <div className="mb-6">
                <ConfidenceBanner
                  overallConfidence={extraction.overall_confidence}
                  lowConfidenceFields={extraction.low_confidence_fields}
                  isMostlyFailed={Boolean(extraction.is_mostly_failed)}
                />
              </div>
              <ExtractionReviewForm
                initialData={extraction.fields}
                lowConfidenceFields={extraction.low_confidence_fields}
              />
            </div>
          </div>
        </div>
      </div>

      <ActionBar purchaseId={purchaseId} />
    </div>
  );
}
