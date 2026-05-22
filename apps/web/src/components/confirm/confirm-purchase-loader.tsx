"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmPageHeader } from "@/components/confirm/confirm-page-header";
import { ConfirmPurchaseContent } from "@/components/confirm/confirm-purchase-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getPurchaseDetail, type PurchaseDetailDoc, PurchasesApiError } from "@/lib/api/purchases";

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
 *   2. Stale guard: if the doc's `status` is NOT `pending_confirmation`,
 *      we replace into `/purchases/:id` (confirm page only makes sense
 *      for rows the user still needs to triage; anything else — already
 *      monitoring, claimed, dismissed — belongs on detail).
 *   3. Analyzing-poll: when the row IS pending_confirmation but the
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

type LoadState =
  | { kind: "loading" }
  | { kind: "analyzing" }
  | { kind: "analyzing_timeout" }
  | { kind: "ready"; purchase: PurchaseDetailDoc }
  | { kind: "error"; message: string };

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
  if (purchase.status !== "pending_confirmation") return false;
  const overallMin = purchase.extraction_confidence?.overall_min;
  return overallMin === 0 || overallMin === null || overallMin === undefined;
}

export function ConfirmPurchaseLoader({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
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

      // Stale-guard: the confirm page is for `pending_confirmation`
      // only. Any other status (monitoring after high-confidence
      // extraction, dismissed, claimed, etc.) belongs on detail.
      // Use `router.replace` rather than `push` so the browser back
      // button doesn't bounce the user right back here.
      if (purchase.status !== "pending_confirmation") {
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
  }, [purchaseId, retryTick]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-neutral-500" aria-label="Loading receipt" />
      </div>
    );
  }

  if (state.kind === "analyzing") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-brand-primary-500" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-neutral-900">Analyzing your receipt…</h1>
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
      <ConfirmPageHeader />
      <ConfirmPurchaseContent purchase={state.purchase} />
    </div>
  );
}
