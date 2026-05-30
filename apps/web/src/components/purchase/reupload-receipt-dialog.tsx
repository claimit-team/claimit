"use client";

/**
 * Re-upload receipt dialog (BUG-85).
 *
 * Lets a user replace the stored receipt on an actively-monitored
 * purchase and correct fields the original extraction got wrong, without
 * leaving the detail page. Two internal steps:
 *
 *   1. "select" — drag/drop or browse a new receipt (PDF/PNG/JPEG ≤10 MB),
 *      then POST /upload (`uploadPurchase`) which stores the blob in GCS +
 *      synchronously extracts its fields. NOTHING is persisted to the
 *      purchase yet (write-after-confirm, same as onboarding).
 *   2. "review" — render the re-extracted fields in the shared
 *      `ExtractionReviewForm` (+ confidence / window banners). Submitting
 *      POSTs /reupload-receipt with the new `storage_url` + the user's
 *      `corrected_fields`; the backend merges extraction + corrections,
 *      swaps the receipt, recomputes the window, and keeps monitoring.
 *
 * The review form is the clobber-safeguard: whatever the user confirms is
 * the new truth, so accepting a corrected extraction genuinely replaces
 * the wrong original values. On success we refetch the detail bundle via
 * `onUpdated`.
 *
 * Reuses the confirm-flow building blocks (`ExtractionReviewForm`,
 * `confirm-form-state` helpers, `ConfidenceBanner`, `WindowWarningBanner`,
 * `usePlatformPolicy`) so this stays a thin orchestration shell rather
 * than a parallel form implementation.
 */

import { FileText, ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { ConfidenceBanner } from "@/components/confirm/confidence-banner";
import { deriveLowConfidenceFields } from "@/components/confirm/confirm-purchase-content";
import { ExtractionReviewForm } from "@/components/confirm/extraction-review-form";
import { WindowWarningBanner } from "@/components/confirm/window-warning-banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlatformPolicy } from "@/hooks/use-platform-policy";
import {
  type PurchaseDetailDoc,
  PurchasesApiError,
  reuploadReceipt,
  type UploadExtraction,
  type UploadReceiptResponse,
  uploadPurchase,
} from "@/lib/api/purchases";
import {
  buildCorrectedFields,
  buildInitialFormState,
  type ConfirmFormState,
  getSubmitBlocker,
} from "@/lib/confirm-form-state";
import { isOutsideWindow } from "@/lib/policy-window";
import { cn } from "@/lib/utils";

// Mirror the backend upload validators (MAX_UPLOAD_BYTES = 10 MB,
// PDF/PNG/JPEG) so the dropzone matches what the server accepts.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPT_MAP: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};
const ACCEPT_LABEL = "PDF, PNG, or JPG up to 10 MB.";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Build a synthetic `PurchaseDetailDoc` from the upload extraction so the
 * shared confirm-form helpers (which key off the doc shape) can seed the
 * review form. Only the fields the form reads carry real values; the rest
 * are nulled — this doc is never persisted, it's purely a form seed.
 */
function synthDocFromExtraction(extraction: UploadExtraction | null): PurchaseDetailDoc {
  const e = extraction;
  return {
    _id: "reupload-draft",
    updated_at: null,
    user_id: null,
    platform: e?.platform ?? null,
    category: e?.category ?? null,
    product_name: e?.product_name ?? null,
    product_id: e?.product_id ?? null,
    product_url: e?.product_url ?? null,
    variant: e?.variant ?? null,
    fare_class: e?.fare_class ?? null,
    room_type: e?.room_type ?? null,
    bed_type: e?.bed_type ?? null,
    rate_type: e?.rate_type ?? null,
    price_paid: e?.price_paid ?? null,
    member_price_at_purchase: e?.member_price_at_purchase ?? null,
    non_member_price_at_purchase: e?.non_member_price_at_purchase ?? null,
    currency: e?.currency ?? "USD",
    purchase_date: e?.purchase_date ?? null,
    purchase_date_basis: e?.purchase_date_basis ?? null,
    window_expires: null,
    order_id: e?.order_id ?? null,
    member_tier_at_purchase: e?.member_tier_at_purchase ?? null,
    status: e?.status ?? "pending_confirmation",
    claim_type: null,
    monitoring_cadence_minutes: null,
    last_checked_at: null,
    last_monitor_error: null,
    last_monitor_error_at: null,
    last_monitor_error_code: null,
    ingested_at: null,
    ingestion_source: null,
    receipt_storage_url: null,
    receipt_hash: null,
    format_hash: null,
    sender: null,
    extraction_confidence: e?.extraction_confidence ?? null,
  };
}

interface ReuploadReceiptDialogProps {
  purchaseId: string;
  /** Display label for the purchase (e.g. "Best Buy") — used in copy. */
  platform: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Refetch the detail bundle after a successful re-upload. */
  onUpdated: () => void;
}

export function ReuploadReceiptDialog({
  purchaseId,
  platform,
  open,
  onOpenChange,
  onUpdated,
}: ReuploadReceiptDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<UploadReceiptResponse | null>(null);
  const [initialState, setInitialState] = useState<ConfirmFormState | null>(null);
  const [formState, setFormState] = useState<ConfirmFormState | null>(null);

  const inReview = draft !== null && formState !== null && initialState !== null;
  const busy = uploading || submitting;

  // Reactive policy lookup for the out-of-window banner (BUG-59 parity).
  // Called unconditionally; "" while no platform is picked yet.
  const { policy, loading: policyLoading } = usePlatformPolicy(formState?.platform ?? "");

  // Reset all transient state whenever the dialog closes so the next open
  // starts clean rather than resuming a stale upload/review.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setUploading(false);
      setSubmitting(false);
      setDraft(null);
      setInitialState(null);
      setFormState(null);
    }
  }, [open]);

  const onDrop = useCallback((accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      const code = rejections[0].errors[0]?.code;
      if (code === "file-too-large") {
        toast.error("That file is too large. PDF, PNG, or JPG up to 10 MB.");
      } else if (code === "file-invalid-type") {
        toast.error("Unsupported file type. We accept PDF, PNG, or JPG.");
      } else {
        toast.error("We couldn't accept that file. Try a different one.");
      }
      return;
    }
    const next = accepted[0];
    if (next) setFile(next);
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openPicker,
  } = useDropzone({
    onDrop,
    accept: ACCEPT_MAP,
    maxSize: MAX_UPLOAD_BYTES,
    multiple: false,
  });

  const handleUpload = useCallback(async () => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const uploaded = await uploadPurchase(file);
      const synthetic = synthDocFromExtraction(uploaded.extraction);
      const seeded = buildInitialFormState(synthetic);
      setDraft(uploaded);
      setInitialState(seeded);
      setFormState(seeded);
    } catch (err) {
      let message = "We couldn't upload that receipt. Try again.";
      if (err instanceof PurchasesApiError) {
        if (err.code === "file_too_large") {
          message = "That file is too large. PDF, PNG, or JPG up to 10 MB.";
        } else if (err.code === "unsupported_media_type") {
          message = "Unsupported file type. We accept PDF, PNG, or JPG.";
        } else if (err.code === "unauthenticated") {
          message = "Sign in to upload a receipt.";
        } else {
          message = err.message;
        }
      }
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }, [file, uploading]);

  const handleSubmit = useCallback(async () => {
    if (!draft || !initialState || !formState || submitting) return;
    const blocker = getSubmitBlocker(formState);
    if (blocker) {
      toast.error(blocker);
      return;
    }
    setSubmitting(true);
    try {
      const corrected = buildCorrectedFields(initialState, formState);
      await reuploadReceipt(purchaseId, {
        storage_url: draft.storage_url,
        content_type: draft.content_type,
        extraction: draft.extraction,
        ...(corrected === undefined ? {} : { corrected_fields: corrected }),
      });
      onUpdated();
      toast.success("Receipt updated.");
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof PurchasesApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't update the receipt. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [draft, initialState, formState, submitting, purchaseId, onUpdated, onOpenChange]);

  // Block Escape / backdrop dismissal while uploading or submitting so a
  // user can't tear down the dialog mid-write.
  const handleOpenChange = (nextOpen: boolean) => {
    if (busy && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  const isPdf = file?.type === "application/pdf";
  const lowConfidence = inReview
    ? deriveLowConfidenceFields(draft.extraction?.extraction_confidence ?? null)
    : { fields: [], isMostlyFailed: false };

  // Out-of-window evaluation for the re-upload review step. Re-upload maps to
  // `reupload_receipt`, which recomputes the window with fallback_default=False
  // — so a missing Policy leaves the window untouched and does NOT 409. Block
  // (and warn) only when a Policy exists and the corrected date is past it;
  // this is never the create/draft path, so there's no 15-day-default block.
  const windowEval =
    inReview && !policyLoading && formState.platform !== "" && formState.purchaseDate !== null
      ? isOutsideWindow({
          purchaseDate: formState.purchaseDate,
          policy,
          memberTier: formState.memberTier.trim() || null,
        })
      : null;
  const outsideWindow = Boolean(windowEval?.outside) && policy !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{inReview ? "Review re-uploaded receipt" : "Re-upload receipt"}</DialogTitle>
          <DialogDescription>
            {inReview
              ? `Confirm the details from the new receipt. ClaimIt keeps monitoring this ${platform} purchase with the corrected information.`
              : `Upload a corrected receipt for this ${platform} purchase. ${ACCEPT_LABEL}`}
          </DialogDescription>
        </DialogHeader>

        {inReview ? (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <ConfidenceBanner
              overallConfidence={draft.extraction?.extraction_confidence?.overall_min ?? 0}
              lowConfidenceFields={lowConfidence.fields}
              isMostlyFailed={lowConfidence.isMostlyFailed}
            />
            <WindowWarningBanner
              platform={formState.platform}
              outside={outsideWindow}
              windowDays={windowEval?.windowDays ?? 0}
            />
            <ExtractionReviewForm
              state={formState}
              onChange={setFormState}
              lowConfidenceFields={lowConfidence.fields}
              disabled={submitting}
            />
          </div>
        ) : file ? (
          <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-0">
              {isPdf ? (
                <FileText className="size-7 text-neutral-500" aria-hidden />
              ) : (
                <ImageIcon className="size-7 text-neutral-500" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-neutral-900 text-sm">{file.name}</p>
              <p className="text-neutral-500 text-xs">{formatBytes(file.size)}</p>
              {uploading ? (
                <p className="mt-2 text-neutral-500 text-xs">Uploading &amp; reading receipt…</p>
              ) : null}
            </div>
            {!uploading ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-neutral-500"
                onClick={() => setFile(null)}
                aria-label="Remove selected file"
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : (
          <div
            {...getRootProps({
              className: cn(
                "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
                isDragActive
                  ? "border-brand-primary-400 bg-brand-primary-50"
                  : "border-neutral-300 hover:border-neutral-400",
              ),
            })}
          >
            <input {...getInputProps()} />
            <UploadCloud className="size-10 text-neutral-400" aria-hidden />
            <div>
              <p className="font-medium text-neutral-900 text-sm">
                {isDragActive ? "Drop your receipt here" : "Drag a receipt here"}
              </p>
              <p className="mt-1 text-neutral-500 text-xs">{ACCEPT_LABEL}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                openPicker();
              }}
            >
              Browse files
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {inReview ? (
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || getSubmitBlocker(formState) !== null || outsideWindow}
              className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!file || uploading}
              className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                "Continue"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
