"use client";

/**
 * /claims/[id] — claim detail (5.6 follow-up).
 *
 * Hooks the enriched `GET /api/v1/claims/:id` bundle and renders via
 * the existing `ClaimDetailShell`. Wire response is shaped into the
 * `ClaimDetail` view-model by `buildClaimDetailViewModel`
 * (see [apps/web/src/lib/claim-detail-view.ts]).
 *
 * The mock lookup (`getClaimDetail`/`getClaimConversation` in
 * `lib/claim-detail.ts`) is intentionally NOT imported here — that
 * file's formatters (`formatClaimCurrency` / `formatClaimRemainingTime`)
 * are still consumed by claim-header / evidence-pane / claims-status,
 * so the file itself stays put. The mock-lookup helpers are now
 * unreferenced and can be removed in a follow-up cleanup once the
 * formatters move to a dedicated module.
 *
 * Mirrors `app/(authenticated)/purchases/[id]/page.tsx` (PR1) for
 * loading / notFound / error / ready state shape so the two detail
 * pages behave consistently.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClaimDetailShell } from "@/components/claims/claim-detail-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ClaimDetailDoc,
  type ClaimDetailResponse,
  ClaimsApiError,
  getClaimDetail,
} from "@/lib/api/claims";
import { buildClaimDetailViewModel } from "@/lib/claim-detail-view";
import { useAuthStore, useClaimDetailRefetchStore } from "@/store";

type ClaimDetailRouteProps = {
  params: Promise<{ id: string }>;
};

/**
 * The page owns the *wire* `ClaimDetailResponse` (not the view-model)
 * so write callers can optimistically patch the underlying `claim`
 * fields and have the VM auto-derive on the next render. Mirrors the
 * `/confirm/:id` loader pattern (page owns the wire bundle; children
 * receive the derived render shape).
 */
type LoadState =
  | { status: "loading" }
  | { status: "ready"; wire: ClaimDetailResponse }
  | { status: "notFound" }
  | { status: "error"; message: string };

export default function ClaimDetailPage({ params }: ClaimDetailRouteProps) {
  const { id } = use(params);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const userId = useAuthStore((state) => state.user?._id ?? null);

  const [state, setState] = useState<LoadState>({ status: "loading" });

  /**
   * Per-instance request-sequence counter. Each `refetch` invocation
   * increments it and captures the new value; once `getClaimDetail`
   * resolves, the call only commits state (or re-throws on error) if
   * its captured sequence still matches `requestSeq.current`. Older
   * inflight calls become no-ops.
   *
   * Guards against (a) the user navigating between two claims quickly
   * (the old fetch's "ready" landing after the new fetch's "loading"
   * → wrong claim_id wired to action buttons), and (b) rapid
   * retry-clicks racing the original load (an old failed retry
   * flipping state back to "error" after a newer one succeeded).
   *
   * Replaces the prior `let mounted = true` cleanup pattern — see
   * `useReviewDraft` for the sibling hook that retains it. CodeRabbit
   * MAJOR + Bugbot MEDIUM, PR #168.
   */
  const requestSeq = useRef(0);

  /**
   * Refetch the enriched detail bundle and replace the wire state on
   * success. Used by write handlers (approve / cancel / edit) to
   * reconcile optimistic patches with server truth.
   *
   * IMPORTANT: re-throws on error and does NOT mutate page state — the
   * caller decides how to handle a refetch failure. Post-write callers
   * catch and show a "refresh failed" toast WITHOUT wiping the
   * optimistic patch from page state; the load-retry path (see
   * `loadDetail`) wraps the call in its own try/catch and converts the
   * error back into a full-page error state.
   *
   * Bugbot MEDIUM finding (PR #168): the earlier version silently
   * caught errors and called `setState({ status: "error" })`, which
   * (a) wiped the optimistic patch on a transient refetch failure
   * and (b) made the nested try/catch in approve/cancel dialogs dead
   * code. The user could see a success toast and a full error page
   * simultaneously. Re-throwing here restores the contract.
   *
   * Intentionally does NOT flip back to "loading" — the previous wire
   * stays visible so the UI doesn't flash a skeleton between
   * optimistic + server states.
   */
  const refetch = useCallback(async () => {
    if (isAuthLoading) return;
    if (userId === null) {
      throw new Error("User must be signed in.");
    }
    const seq = ++requestSeq.current;
    try {
      const wire = await getClaimDetail(id);
      // Stale completion — a newer refetch superseded us; drop the
      // result silently so we don't clobber the newer state.
      if (seq !== requestSeq.current) return;
      setState({ status: "ready", wire });
    } catch (err) {
      // Same staleness check on the error path: a stale failure must
      // not flip a newer successful state back to "error" via the
      // loadDetail catch block.
      if (seq !== requestSeq.current) return;
      throw err;
    }
  }, [id, isAuthLoading, userId]);

  const registerRefetch = useClaimDetailRefetchStore((s) => s.register);
  const unregisterRefetch = useClaimDetailRefetchStore((s) => s.unregister);

  useEffect(() => {
    registerRefetch(id, refetch);
    return () => unregisterRefetch(id);
  }, [id, refetch, registerRefetch, unregisterRefetch]);

  /**
   * Load (or retry-load) the detail bundle and convert any failure into
   * a page-level error state. Used by the initial mount effect and by
   * the "Try again" button in the error view. Shares the error-to-state
   * conversion with the original useEffect (DRY).
   *
   * Always flips into `{ status: "loading" }` before issuing the fetch
   * so the retry-button click in the error view gives the user
   * immediate feedback (Bugbot MEDIUM finding, PR #168). Without this,
   * the error screen stayed visible during the retry and looked
   * broken. The initial useEffect also sets loading explicitly — the
   * double-set is a cheap no-op.
   */
  const loadDetail = useCallback(async () => {
    if (isAuthLoading) return;
    if (userId === null) {
      setState({ status: "error", message: "User must be signed in." });
      return;
    }
    setState({ status: "loading" });
    try {
      await refetch();
    } catch (err: unknown) {
      if (err instanceof ClaimsApiError && err.code === "claim_not_found") {
        setState({ status: "notFound" });
        return;
      }
      const message =
        err instanceof ClaimsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setState({ status: "error", message });
    }
  }, [isAuthLoading, refetch, userId]);

  /**
   * Shallow-merge a `Partial<ClaimDetailDoc>` into the wire `claim`.
   * The VM re-derives on the next render via `useMemo`. Always paired
   * with `await refetch()` in `catch` (per WI write contract) so a
   * failed server write reconciles back to server truth — never
   * leave optimistic state hanging.
   */
  const applyOptimistic = useCallback((patch: Partial<ClaimDetailDoc>) => {
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      return {
        ...prev,
        wire: {
          ...prev.wire,
          claim: { ...prev.wire.claim, ...patch },
        },
      };
    });
  }, []);

  useEffect(() => {
    if (isAuthLoading) {
      setState({ status: "loading" });
      return;
    }
    if (userId === null) {
      setState({ status: "error", message: "User must be signed in." });
      return;
    }

    // Mount → loading → loadDetail() converts success/failure into the
    // appropriate page state. We can't await loadDetail inside the
    // effect (synchronous), so fire-and-forget; the unmount guard in
    // refetch's setState is unnecessary because loadDetail itself
    // checks isAuthLoading / userId before calling refetch.
    setState({ status: "loading" });
    void loadDetail();
  }, [isAuthLoading, loadDetail, userId]);

  const vm = useMemo(
    () => (state.status === "ready" ? buildClaimDetailViewModel(state.wire) : null),
    [state],
  );

  if (state.status === "loading") {
    return <ClaimDetailSkeleton />;
  }
  if (state.status === "notFound") {
    return <ClaimDetailNotFound />;
  }
  if (state.status === "error") {
    return <ClaimDetailError message={state.message} onRetry={() => void loadDetail()} />;
  }
  if (vm === null) {
    return <ClaimDetailSkeleton />;
  }
  return <ClaimDetailShell claim={vm} refetch={refetch} applyOptimistic={applyOptimistic} />;
}

// ---------------------------------------------------------------------------
// State views
// ---------------------------------------------------------------------------

/**
 * Skeleton resembling the 3-pane shell so the layout doesn't reflow
 * once data arrives. Heights match `h-[calc(100dvh-4rem)]` minus the
 * sticky header so the empty state feels like a real loading view.
 */
function ClaimDetailSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <div className="flex h-16 items-center justify-between border-neutral-200 border-b bg-neutral-0 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="flex flex-1 gap-2 bg-neutral-50 p-2">
        <Skeleton className="h-full w-2/5 rounded-lg" />
        <div className="flex w-3/5 flex-col gap-2">
          <Skeleton className="h-3/5 w-full rounded-lg" />
          <Skeleton className="h-2/5 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function ClaimDetailNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 lg:px-6">
      <Alert>
        <AlertTitle>Claim not found</AlertTitle>
        <AlertDescription>
          <p className="mb-3 text-sm">
            This claim doesn&apos;t exist or isn&apos;t available on your account.
          </p>
          <Button render={<a href="/claims">Back to claims</a>} size="sm" variant="outline" />
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ClaimDetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 lg:px-6">
      <Alert>
        <AlertTitle>Couldn&apos;t load this claim</AlertTitle>
        <AlertDescription>
          <p className="mb-3 text-sm">{message}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
