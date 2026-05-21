/**
 * useMonitoredPurchases — small, dedicated fetch for the dashboard's
 * "Monitored purchases" section.
 *
 * NOT the same as `usePurchases` (which drives the full /purchases
 * list with debounced search, cursor pagination, generation-guarded
 * stale-while-error). The dashboard section is:
 *  - Filtered to BOTH `monitoring` AND `monitoring_degraded` — these
 *    are the same two statuses the dashboard summary's
 *    `monitoring_purchases_count` aggregates (see
 *    `_MONITORING_STATUSES` in apps/api-gateway/src/services/dashboard.py).
 *    Counting only `monitoring` would produce a visible inconsistency
 *    where the summary card reports a higher number than the section
 *    actually renders — and the degraded amber-dot rendering in
 *    `MonitoredPurchasesSection` would be dead code.
 *  - Showing a small fixed slice (5 rows by default) — never paginated.
 *  - No search, no filter UI, no debounce.
 *
 * Carrying the full `usePurchases` hook here would over-fetch (debounce
 * effect, cursor state, generation tracking) for a section that just
 * needs the top-N monitoring slice once per mount.
 *
 * Lifecycle mirrors `useDashboardSummary` for consistency: wait for
 * AuthInit, mounted-flag guards post-unmount writes, refetch via tick.
 *
 * Error handling is non-blocking by design (dashboard is demo-central
 * — never block render). The dashboard section maps `error !== null`
 * to a muted "Couldn't load monitored purchases" row, NOT to the
 * empty-copy "Nothing being monitored" (which would falsely imply the
 * user has none when the call actually failed).
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { listPurchases, type PurchaseListItem, PurchasesApiError } from "@/lib/api/purchases";
import { useAuthStore } from "@/store";

const DEFAULT_LIMIT = 5;

type UseMonitoredPurchasesArgs = {
  limit?: number;
};

type UseMonitoredPurchasesResult = {
  purchases: PurchaseListItem[];
  isLoading: boolean;
  error: PurchasesApiError | null;
  refetch: () => void;
};

export function useMonitoredPurchases({
  limit = DEFAULT_LIMIT,
}: UseMonitoredPurchasesArgs = {}): UseMonitoredPurchasesResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<PurchasesApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const refetch = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setPurchases([]);
      setError(new PurchasesApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    // Mirror `_MONITORING_STATUSES` from the backend dashboard service
    // so the section's row set matches the summary's count exactly.
    listPurchases({ status: ["monitoring", "monitoring_degraded"], limit })
      .then((page) => {
        if (!mounted) return;
        setPurchases(page.purchases);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        if (err instanceof PurchasesApiError) {
          setError(err);
        } else {
          setError(
            new PurchasesApiError(
              "unknown_error",
              err instanceof Error ? err.message : "Unknown error",
            ),
          );
        }
        // Keep previously-fetched rows on transient failures so the
        // dashboard layout doesn't collapse mid-session. Initial-load
        // failures leave `purchases` as `[]`, which the section maps
        // to the explicit "Couldn't load…" row (not the empty copy).
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, isAuthLoading, limit, reloadTick]);

  return { purchases, isLoading, error, refetch };
}
