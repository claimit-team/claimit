"use client";

/**
 * /purchases/[id] - purchase detail (ticket 5.6).
 *
 * Hooks the enriched `GET /api/v1/purchases/:id` bundle and renders
 * via the existing `PurchaseDetailContent` shell. Real data is shaped
 * into a `PurchaseDetailViewModel` by `buildPurchaseDetailViewModel`
 * (see `lib/purchase-detail-view.ts`).
 *
 * The mock view-model (lib/mock-purchases.ts) was deleted in ticket
 * 5.14 B10 once the confirm flow real-ified.
 */

import { use, useEffect, useState } from "react";

import { PurchaseDetailContent } from "@/components/purchase/purchase-detail-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPurchaseDetail, PurchasesApiError } from "@/lib/api/purchases";
import {
  buildPurchaseDetailViewModel,
  type PurchaseDetailViewModel,
} from "@/lib/purchase-detail-view";
import { useAuthStore } from "@/store";

type PurchaseDetailRouteProps = {
  params: Promise<{ id: string }>;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; vm: PurchaseDetailViewModel }
  | { status: "notFound" }
  | { status: "error"; message: string };

export default function PurchaseDetailPage({ params }: PurchaseDetailRouteProps) {
  // `use(params)` unwraps the Next 15 Promise-based dynamic-segment
  // value on the client. Matches the App-router conventions used by
  // the rest of the authenticated section.
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

    getPurchaseDetail(id)
      .then((response) => {
        if (!mounted) return;
        const vm = buildPurchaseDetailViewModel(response);
        setState({ status: "ready", vm });
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        // 404 (missing OR cross-user) -> show the not-found state, not
        // a generic error. Other failures (timeout, 5xx, network) get
        // an explanatory message + retry button.
        if (err instanceof PurchasesApiError && err.code === "not_found") {
          setState({ status: "notFound" });
          return;
        }
        const message =
          err instanceof PurchasesApiError
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
    return <PurchaseDetailSkeleton />;
  }
  if (state.status === "notFound") {
    return <PurchaseDetailNotFound />;
  }
  if (state.status === "error") {
    return (
      <PurchaseDetailError
        message={state.message}
        onRetry={() => setReloadTick((tick) => tick + 1)}
      />
    );
  }
  return <PurchaseDetailContent purchase={state.vm} />;
}

// ---------------------------------------------------------------------------
// State views
// ---------------------------------------------------------------------------

function PurchaseDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[960px] space-y-6 px-4 py-6 lg:px-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

function PurchaseDetailNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 lg:px-6">
      <Alert>
        <AlertTitle>Purchase not found</AlertTitle>
        <AlertDescription>
          <p className="mb-3 text-sm">
            This purchase doesn&apos;t exist or isn&apos;t available on your account.
          </p>
          <Button render={<a href="/purchases">Back to purchases</a>} size="sm" variant="outline" />
        </AlertDescription>
      </Alert>
    </div>
  );
}

function PurchaseDetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 lg:px-6">
      <Alert>
        <AlertTitle>Couldn&apos;t load this purchase</AlertTitle>
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
