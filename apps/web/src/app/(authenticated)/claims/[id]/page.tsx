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

import { use, useEffect, useState } from "react";

import { ClaimDetailShell } from "@/components/claims/claim-detail-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClaimsApiError, getClaimDetail } from "@/lib/api/claims";
import type { ClaimDetail } from "@/lib/claim-detail-types";
import { buildClaimDetailViewModel } from "@/lib/claim-detail-view";
import { useAuthStore } from "@/store";

type ClaimDetailRouteProps = {
  params: Promise<{ id: string }>;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; vm: ClaimDetail }
  | { status: "notFound" }
  | { status: "error"; message: string };

export default function ClaimDetailPage({ params }: ClaimDetailRouteProps) {
  // `use(params)` unwraps the Next 15+ Promise-based dynamic-segment
  // value on the client (matches PR1's purchase detail).
  const { id } = use(params);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const userId = useAuthStore((state) => state.user?._id ?? null);

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadTick, setReloadTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    if (isAuthLoading) {
      setState({ status: "loading" });
      return;
    }
    if (userId === null) {
      setState({ status: "error", message: "User must be signed in." });
      return;
    }

    let mounted = true;
    setState({ status: "loading" });

    getClaimDetail(id)
      .then((response) => {
        if (!mounted) return;
        const vm = buildClaimDetailViewModel(response);
        setState({ status: "ready", vm });
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        // 404 (missing OR cross-user — the backend returns the same
        // `claim_not_found` for both to avoid leaking existence) maps
        // to the not-found state. Other failures (timeout, 5xx,
        // network) get a retryable error message.
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
      });

    return () => {
      mounted = false;
    };
  }, [id, isAuthLoading, userId, reloadTick]);

  if (state.status === "loading") {
    return <ClaimDetailSkeleton />;
  }
  if (state.status === "notFound") {
    return <ClaimDetailNotFound />;
  }
  if (state.status === "error") {
    return (
      <ClaimDetailError message={state.message} onRetry={() => setReloadTick((tick) => tick + 1)} />
    );
  }
  return <ClaimDetailShell initialClaim={state.vm} />;
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
