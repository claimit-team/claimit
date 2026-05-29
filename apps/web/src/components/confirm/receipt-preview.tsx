"use client";

import { Download, FileText, ImageIcon, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchReceiptBlob, PurchasesApiError } from "@/lib/api/purchases";

/**
 * Receipt preview (ticket 5.14 B6 — real authenticated blob fetch).
 *
 * Fetches `GET /api/v1/purchases/:id/receipt` through the
 * api-gateway proxy (NOT a signed URL — the receipts bucket has
 * `public_access_prevention=enforced`), converts the response body
 * into a Blob, and renders:
 *   - an `<img>` for image content types;
 *   - an `<iframe>` for PDFs (most modern browsers render the bytes
 *     inline; the iframe's own scrollbars handle multi-page).
 * The object URL created from the Blob is revoked on unmount so we
 * don't leak the in-memory bitmap.
 *
 * The wire helper `fetchReceiptBlob` collapses every "no receipt"
 * server shape (missing `receipt_storage_url`, non-owner, blob
 * missing, malformed gs://) into a single `null` return — so a
 * Gmail-source purchase with no receipt OR a degraded doc with a
 * stale URL surfaces the same tasteful "Original not available"
 * fallback below. We never paint a broken-image icon.
 *
 * Error states:
 *   - 404 / null → "Original not available" + source-aware copy;
 *   - other errors → an inline message with a retry button. We
 *     keep this surface compact (no destructive Alert) because the
 *     form on the right is the primary action — failing the
 *     receipt preview should not stop the user from confirming.
 */
type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; url: string; contentType: string };

export interface ReceiptPreviewProps {
  /**
   * Fetch the receipt via the api-gateway proxy
   * (`GET /api/v1/purchases/:id/receipt`) — the persisted-purchase path.
   * Omit when rendering a pre-supplied `blob` instead.
   */
  purchaseId?: string;
  /**
   * Render these bytes directly instead of fetching — the write-after-confirm
   * upload path. The receipt lives in GCS but no purchase doc backs the proxy
   * yet, so the confirm page hands us the File the browser still holds. The
   * content type is read off the blob (`File`/`Blob` both carry `.type`).
   */
  blob?: Blob | null;
  /**
   * Best-effort filename for the header (and PDF iframe title).
   * Optional — when the doc carries no original filename we fall
   * back to "Receipt" + the content-type icon.
   */
  filename?: string | null;
  /**
   * Surfaced inside the "Original not available" fallback to give
   * the user context for why no receipt is rendered.
   *  - `gmail`  → "Receipt arrived via Gmail (we don't store the
   *    original message attachment)."
   *  - anything else → "We don't have a stored receipt for this
   *    purchase."
   */
  ingestionSource: string | null;
}

function isPdfContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("application/pdf");
}

function isImageContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("image/");
}

export function ReceiptPreview({
  purchaseId,
  blob,
  filename,
  ingestionSource,
}: ReceiptPreviewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [zoomOpen, setZoomOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Effect intentionally re-runs whenever the user hits Retry — the
  // `reloadTick` dependency is the manual trigger; everything else
  // is captured stable for the lifetime of the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reloadTick` is the manual refetch trigger; it isn't read inside the effect body but its state change must re-run the fetch.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    setState({ kind: "loading" });

    // Pre-supplied bytes (upload draft): render straight from the blob, no
    // round trip. We still own the object-URL lifecycle so the cleanup below
    // revokes it on unmount, exactly like the fetched path.
    if (blob) {
      createdUrl = URL.createObjectURL(blob);
      setState({
        kind: "ready",
        url: createdUrl,
        contentType: blob.type || "application/octet-stream",
      });
      return () => {
        cancelled = true;
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    if (!purchaseId) {
      setState({ kind: "missing" });
      return;
    }

    fetchReceiptBlob(purchaseId)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setState({ kind: "missing" });
          return;
        }
        createdUrl = URL.createObjectURL(result.blob);
        setState({ kind: "ready", url: createdUrl, contentType: result.contentType });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof PurchasesApiError ? err.message : "We couldn't load the receipt preview.";
        setState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
      // Revoke the object URL so the browser can release the in-
      // memory blob. We do this on unmount AND on every retry
      // (the cleanup runs before the next effect body executes).
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [purchaseId, blob, reloadTick]);

  const headerName = filename || "Receipt";
  const headerIcon =
    state.kind === "ready" && isPdfContentType(state.contentType) ? (
      <FileText className="size-4 shrink-0 text-neutral-500" aria-hidden />
    ) : (
      <ImageIcon className="size-4 shrink-0 text-neutral-500" aria-hidden />
    );

  const handleDownload = useCallback(() => {
    if (state.kind !== "ready") return;
    const link = document.createElement("a");
    link.href = state.url;
    link.download = filename || (isPdfContentType(state.contentType) ? "receipt.pdf" : "receipt");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [state, filename]);

  return (
    <div className="flex flex-col rounded-lg border border-neutral-200 bg-neutral-0">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {headerIcon}
          <span className="text-sm font-medium text-neutral-700 truncate max-w-[200px]">
            {headerName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="text-neutral-500 hover:text-neutral-700 shrink-0"
          disabled={state.kind !== "ready"}
          onClick={handleDownload}
        >
          <Download className="mr-1 size-4" aria-hidden />
          Download
        </Button>
      </div>

      <div className="relative">
        {state.kind === "loading" ? (
          <div className="flex h-[400px] items-center justify-center bg-neutral-50 lg:h-[500px]">
            <span className="text-sm text-neutral-500">Loading receipt…</span>
          </div>
        ) : null}

        {state.kind === "missing" ? (
          <MissingReceiptFallback ingestionSource={ingestionSource} />
        ) : null}

        {state.kind === "error" ? (
          <div className="flex h-[400px] flex-col items-center justify-center gap-3 bg-neutral-50 p-6 text-center lg:h-[500px]">
            <p className="text-sm text-neutral-700">{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadTick((t) => t + 1)}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {state.kind === "ready" && isPdfContentType(state.contentType) ? (
          <iframe
            src={state.url}
            title={headerName}
            className="h-[400px] w-full bg-neutral-50 lg:h-[500px]"
          />
        ) : null}

        {state.kind === "ready" && isImageContentType(state.contentType) ? (
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="group relative w-full cursor-zoom-in text-left"
          >
            <ScrollArea className="h-[400px] lg:h-[500px]">
              <div className="flex items-center justify-center bg-neutral-50 p-4">
                {/* biome-ignore lint/performance/noImgElement: Object-URL preview backed by the api-gateway proxy fetch; next/image would force a remote loader on a blob: URL. */}
                <img
                  src={state.url}
                  alt={headerName}
                  className="max-h-[600px] w-auto rounded border border-neutral-200 bg-neutral-0 shadow-sm"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-950/0 transition-colors group-hover:bg-neutral-950/10">
                  <div className="rounded-full bg-neutral-0/90 p-2 opacity-0 shadow transition-opacity group-hover:opacity-100">
                    <ZoomIn className="size-5 text-neutral-700" aria-hidden />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </button>
        ) : null}

        {/* Defensive: an unknown content-type still got bytes — let the
            user at least download them rather than rendering nothing. */}
        {state.kind === "ready" &&
        !isPdfContentType(state.contentType) &&
        !isImageContentType(state.contentType) ? (
          <div className="flex h-[400px] flex-col items-center justify-center gap-3 bg-neutral-50 p-6 text-center lg:h-[500px]">
            <FileText className="size-12 text-neutral-300" aria-hidden />
            <p className="text-sm text-neutral-500">
              Preview not available for this receipt format. Download to view it.
            </p>
          </div>
        ) : null}
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-3xl" showCloseButton>
          <DialogTitle className="sr-only">{headerName}</DialogTitle>
          <div className="flex max-h-[80vh] items-center justify-center overflow-auto p-4">
            {state.kind === "ready" && isImageContentType(state.contentType) ? (
              // biome-ignore lint/performance/noImgElement: Object-URL preview backed by the api-gateway proxy fetch.
              <img src={state.url} alt={headerName} className="h-auto w-full" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * "Original receipt not available" surface. Exported so the
 * confirm-page parent can render it directly when
 * `purchase.receipt_storage_url` is null — in that case mounting
 * the full ReceiptPreview just to fetch a known-404 endpoint
 * would waste a round trip and briefly flash the "Loading…"
 * shell.
 *
 * Two variants:
 *  - `panel`   (default) — same vertical footprint as the loaded
 *    receipt iframe / image so the left column doesn't collapse
 *    when a non-receipt blob 404s mid-load. This is the variant
 *    ReceiptPreview itself uses for its in-flow `missing` state.
 *  - `compact` — fits inside the same bordered card as a sized
 *    receipt but stays smaller (max ~280px height). Used by the
 *    confirm-purchase content shell when the doc explicitly has
 *    no `receipt_storage_url` — there's no pending fetch to fall
 *    back to, so we want a quieter surface that doesn't dominate
 *    the column.
 */
export function MissingReceiptFallback({
  ingestionSource,
  variant = "panel",
  title = "Original receipt not available",
  body: bodyOverride,
}: {
  ingestionSource: string | null;
  variant?: "panel" | "compact";
  /** Override the heading — e.g. the pre-confirm upload draft case. */
  title?: string;
  /** Override the body copy — defaults to the ingestion-source-aware text. */
  body?: string;
}) {
  const body =
    bodyOverride ??
    (ingestionSource === "gmail"
      ? "This purchase came in through Gmail. We don't store the original email attachment, but we did capture every detail you see on the right."
      : "We don't have a stored receipt for this purchase. Everything we extracted is on the right.");
  const sizeClass =
    variant === "panel"
      ? "h-[400px] lg:h-[500px]"
      : // Compact: short enough that the form column is the visual
        // focus, tall enough to feel intentional rather than
        // accidental margin.
        "min-h-[180px] py-8";
  return (
    <div
      className={`flex ${sizeClass} flex-col items-center justify-center gap-3 bg-neutral-50 p-6 text-center`}
    >
      <FileText
        className={variant === "compact" ? "size-8 text-neutral-300" : "size-12 text-neutral-300"}
        aria-hidden
      />
      <p className="max-w-xs text-sm font-medium text-neutral-700">{title}</p>
      <p className="max-w-xs text-sm text-neutral-500">{body}</p>
    </div>
  );
}
