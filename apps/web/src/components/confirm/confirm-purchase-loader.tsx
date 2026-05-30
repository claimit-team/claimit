"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmPageHeader } from "@/components/confirm/confirm-page-header";
import { ConfirmPurchaseContent } from "@/components/confirm/confirm-purchase-content";
import { MultiItemSelection } from "@/components/confirm/multi-item-selection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPurchaseDetail, type PurchaseDetailDoc, PurchasesApiError } from "@/lib/api/purchases";
import {
  type ConfirmDraft,
  type ConfirmDraftContext,
  draftForLine,
  isStagingKey,
  readUploadDraft,
} from "@/lib/confirm-staging";

/**
 * Client-side loader for /confirm/[purchaseId] (ticket 5.14 B3).
 *
 * Why client-side: `getPurchaseDetail` runs through `_request` which
 * reads `auth.currentUser.getIdToken()` — Firebase client-SDK state
 * only exists in the browser. /purchases/[id] uses the same pattern
 * so the FE has a single fetch path across detail surfaces.
 *
 * Flow:
 *   1. Initial fetch of `getPurchaseDetail(purchaseId)`.
 *   2. Stale guard: if the doc's `status` is NOT one of the reviewable
 *      states (`pending_confirmation`, `pending_user_edit`), we replace
 *      into `/purchases/:id` (confirm page only makes sense for rows
 *      the user still needs to triage; anything else — already
 *      monitoring, claimed, dismissed — belongs on detail).
 *      `pending_user_edit` is the ingest-extractor route for multi-item
 *      receipts / synthesized-product-id rows; same review form applies.
 *   3. Analyzing-poll: when the row IS in a reviewable status but the
 *      extraction sentinel is still in place (overall_min === 0 and the
 *      placeholder price 0.01 still on the doc — set by the api-gateway
 *      upload route), render an "Analyzing your receipt…" panel and
 *      re-fetch every POLL_INTERVAL_MS until either:
 *        - the doc carries real extraction (overall_min > 0) → render
 *          the form (a second flip to `monitoring` on the next poll is
 *          handled by step 2 above on the very next iteration);
 *        - the doc flips to `monitoring` directly (high-confidence
 *          extraction) → redirect to /purchases/:id;
 *        - we hit POLL_CAP_MS without resolution → render a graceful
 *          "still analyzing" panel with a manual-refresh button. This
 *          prevents the page from spinning forever if the extract path
 *          stalled (Pub/Sub redelivery loop, Gemini outage, etc).
 *   4. Hard errors (network, 404) surface an Alert with retry.
 *
 * The poll interval is intentionally conservative — every 1.5s for at
 * most ~30 attempts — to keep the api-gateway QPS bounded if a user
 * leaves the tab open. Authenticated fetches are not free; this is the
 * "best-effort show progress" surface, not a real-time pipe.
 */
const POLL_INTERVAL_MS = 1500;
const POLL_CAP_MS = 45_000;

const REVIEWABLE_STATUSES: ReadonlySet<string> = new Set([
  "pending_confirmation",
  "pending_user_edit",
]);

type LoadState =
  | { kind: "loading" }
  | { kind: "analyzing" }
  | { kind: "analyzing_timeout" }
  | { kind: "selecting"; draft: ConfirmDraftContext }
  | {
      kind: "ready";
      purchase: PurchaseDetailDoc;
      draft?: ConfirmDraftContext;
      // Set on the multi-item per-line confirm: which receipt line is
      // being confirmed. Its presence switches ActionBar into
      // "track-another" mode (mark tracked + return to the list).
      lineKey?: string;
    }
  | { kind: "error"; message: string };

/** Upload content-type → Purchase.ingestion_source (display + fallback copy). */
function inferIngestionSource(contentType: string): string {
  return contentType === "application/pdf" ? "upload_pdf" : "upload_image";
}

/**
 * Build a `PurchaseDetailDoc`-shaped object from an upload draft so the
 * confirm form renders immediately from carried data (write-after-confirm —
 * no doc exists yet). `_id` is the staging key; `receipt_storage_url` stays
 * null because the blob isn't proxy-fetchable until the purchase is created.
 * Null fields drive the manual-fill form when extraction failed.
 */
function synthesizePurchaseFromDraft(draft: ConfirmDraft, stagingKey: string): PurchaseDetailDoc {
  const e = draft.extraction;
  return {
    _id: stagingKey,
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
    ingestion_source: inferIngestionSource(draft.content_type),
    receipt_storage_url: null,
    receipt_hash: draft.receipt_hash,
    format_hash: null,
    sender: null,
    extraction_confidence: e?.extraction_confidence ?? null,
  };
}

/**
 * The upload route writes a sentinel `pending_confirmation` purchase
 * with `extraction_confidence.overall_min = 0.0` and a placeholder
 * `price_paid = 0.01` (see `_UPLOAD_PURCHASE_DEFAULTS` in
 * apps/api-gateway/src/services/purchases.py). Real extraction always
 * lands a non-zero overall_min, so checking that field alone is enough
 * to distinguish "still analyzing" from "low confidence but real". We
 * still cross-check `status === pending_confirmation` so the rare case
 * of a high-confidence pre-extraction race (status already flipped to
 * monitoring while the FE was in flight) bypasses the poll entirely
 * and goes straight to the stale-guard.
 */
function isAwaitingExtraction(purchase: PurchaseDetailDoc): boolean {
  if (!REVIEWABLE_STATUSES.has(purchase.status ?? "")) return false;
  const overallMin = purchase.extraction_confidence?.overall_min;
  return overallMin === 0 || overallMin === null || overallMin === undefined;
}

function ReceiptCardSkeleton() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Skeleton className="mx-auto aspect-[4/3] w-full max-w-sm rounded-xl" />
      <Skeleton className="mx-auto mt-6 h-6 w-2/3" />
      <Skeleton className="mx-auto mt-3 h-4 w-full max-w-xs" />
      <Skeleton className="mx-auto mt-2 h-4 w-full max-w-xs" />
    </div>
  );
}

export function ConfirmPurchaseLoader({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?line=<receipt_line_key>` selects one line of a multi-item receipt to
  // confirm. Absent → render the selection list; present → render the
  // confirm form pre-filled for that line.
  const lineParam = searchParams.get("line");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // Manual refetch trigger. `router.refresh()` only re-runs server
  // components / resets the route cache — it doesn't remount this
  // client component or change `purchaseId`, so the effect below
  // (whose dep list is `[purchaseId, retryTick]`) would never
  // re-execute on its own and the retry button would silently hang
  // the UI in the loading spinner. Incrementing `retryTick` is the
  // only thing that actually restarts the fetch loop. Bumped by both
  // the "Try again" (error) and "Refresh" (analyzing-timeout) buttons.
  const [retryTick, setRetryTick] = useState(0);

  // Stable ref to the latest router so we can navigate inside the
  // effect without retriggering it on every router-instance change.
  const routerRef = useRef(router);
  routerRef.current = router;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `retryTick` is the manual refetch trigger; it isn't read inside the effect body but its state change must re-run the fetch.
  useEffect(() => {
    // Write-after-confirm upload path: the route param is a staging key
    // and the extracted fields were stashed client-side by the upload
    // dialog. Render the form immediately from the carried draft — there
    // is no doc to fetch and no extraction to poll for.
    if (isStagingKey(purchaseId)) {
      const draft = readUploadDraft(purchaseId);
      if (!draft) {
        // Draft evicted (refresh after sessionStorage cleared, or a stale
        // link). Nothing was persisted, so the only recovery is re-upload.
        setState({
          kind: "error",
          message: "This upload session has expired. Please upload the receipt again.",
        });
        return;
      }

      const draftContext: ConfirmDraftContext = { ...draft, stagingKey: purchaseId };
      const lineItems = draft.extraction?.line_items;
      const isMultiItem = Array.isArray(lineItems) && lineItems.length > 1;

      if (isMultiItem && !lineParam) {
        // No line picked yet — show the selection list.
        setState({ kind: "selecting", draft: draftContext });
        return;
      }

      if (isMultiItem && lineParam) {
        // A specific line is selected — render the confirm form pre-filled
        // for it. A stale/invalid `?line=` falls back to the list.
        const lineDraft = draftForLine(draft, lineParam);
        if (!lineDraft) {
          setState({ kind: "selecting", draft: draftContext });
          return;
        }
        setState({
          kind: "ready",
          purchase: synthesizePurchaseFromDraft(lineDraft, purchaseId),
          draft: { ...lineDraft, stagingKey: purchaseId },
          lineKey: lineParam,
        });
        return;
      }

      // Single-item (or manual-fill) upload — unchanged today's path.
      setState({
        kind: "ready",
        purchase: synthesizePurchaseFromDraft(draft, purchaseId),
        draft: draftContext,
      });
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    async function tick(): Promise<{ done: boolean }> {
      let purchase: PurchaseDetailDoc;
      try {
        const response = await getPurchaseDetail(purchaseId);
        purchase = response.purchase;
      } catch (err) {
        if (cancelled) return { done: true };
        const message =
          err instanceof PurchasesApiError
            ? err.code === "not_found"
              ? "We couldn't find that receipt — it may have been deleted."
              : err.message
            : "Something went wrong loading this receipt.";
        setState({ kind: "error", message });
        return { done: true };
      }
      if (cancelled) return { done: true };

      // Stale-guard: the confirm page is for reviewable rows only
      // (`pending_confirmation` or `pending_user_edit`). Any other
      // status (monitoring after high-confidence extraction, dismissed,
      // claimed, etc.) belongs on detail.
      // Use `router.replace` rather than `push` so the browser back
      // button doesn't bounce the user right back here.
      if (!REVIEWABLE_STATUSES.has(purchase.status ?? "")) {
        routerRef.current.replace(`/purchases/${purchase._id}`);
        return { done: true };
      }

      if (isAwaitingExtraction(purchase)) {
        // Still the sentinel — render the analyzing panel and keep
        // polling unless we've exhausted the budget.
        if (Date.now() - startedAt >= POLL_CAP_MS) {
          setState({ kind: "analyzing_timeout" });
          return { done: true };
        }
        setState({ kind: "analyzing" });
        return { done: false };
      }

      // Real extraction landed — render the form.
      setState({ kind: "ready", purchase });
      return { done: true };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    async function loop(): Promise<void> {
      while (!cancelled) {
        const result = await tick();
        if (result.done || cancelled) return;
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, POLL_INTERVAL_MS);
        });
      }
    }

    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [purchaseId, retryTick, lineParam]);

  if (state.kind === "loading") {
    return <ReceiptCardSkeleton />;
  }

  if (state.kind === "selecting") {
    return (
      <div className="flex flex-col gap-4">
        <ConfirmPageHeader />
        <MultiItemSelection draft={state.draft} />
      </div>
    );
  }

  if (state.kind === "analyzing") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Skeleton className="mx-auto aspect-[4/3] w-full max-w-sm rounded-xl" />
        <h1 className="mt-6 text-lg font-semibold text-neutral-900">Analyzing your receipt…</h1>
        <p className="mt-2 text-sm text-neutral-600">
          We&apos;re reading the purchase details. This usually takes a few seconds.
        </p>
      </div>
    );
  }

  if (state.kind === "analyzing_timeout") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Still analyzing your receipt</h1>
        <p className="mt-2 text-sm text-neutral-600">
          This is taking longer than usual. Refresh in a moment to pick up where we left off.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => {
            setState({ kind: "loading" });
            setRetryTick((t) => t + 1);
          }}
        >
          Refresh
        </Button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this receipt</AlertTitle>
          <AlertDescription>
            <p className="mt-2 text-sm">{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setState({ kind: "loading" });
                // Bump the retry tick — its presence in the effect's
                // dep list is what actually re-runs the fetch loop
                // (purchaseId never changes for this mounted page).
                setRetryTick((t) => t + 1);
              }}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Back affordance sits above the form, mirroring the
  // `/purchases/:id` header layout (`PurchasePageHeader`) so the
  // top-left "back to where I came from" affordance is consistent
  // across the two detail/confirm surfaces. Origin-aware via
  // `?from=` — see `ConfirmPageHeader` / `resolveBackHref` for the
  // open-redirect safe-list. Cancel inside the action-bar stays
  // hardcoded to `/dashboard` per the locked decision.
  return (
    <div className="flex flex-col gap-4">
      {/* Per-line confirm of a multi-item receipt: Back returns to the
          item selection list it came from (drop the `?line=`), not the
          dashboard. Single-item / Gmail confirms have no lineKey, so Back
          falls through to the `?from=` behavior unchanged. */}
      <ConfirmPageHeader backHref={state.lineKey ? `/confirm/${purchaseId}` : undefined} />
      <ConfirmPurchaseContent
        purchase={state.purchase}
        draft={state.draft}
        lineKey={state.lineKey}
      />
    </div>
  );
}
