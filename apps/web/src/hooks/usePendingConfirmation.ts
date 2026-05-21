/**
 * usePendingConfirmation — small, dedicated fetch for the dashboard's
 * "Needs your attention" section (the `confirm_extraction` cards).
 *
 * Mirrors the shape of `useMonitoredPurchases`:
 *   - small fixed slice (5 rows by default), never paginated;
 *   - no search/filter UI;
 *   - non-blocking error state — the dashboard never blocks render.
 *
 * Scoped to `status=pending_confirmation` only (i.e. uploads whose
 * Gemini extraction landed below the 0.95 overall_min threshold, or
 * who are still awaiting extraction with sentinel scores). When the
 * call fails or returns zero, the dashboard maps that to the same
 * "nothing here" empty in `NeedsAttentionSection` — we'd rather
 * under-surface than render a fake error inside a multi-card section.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { listPurchases, type PurchaseListItem, PurchasesApiError } from "@/lib/api/purchases";
import { useAuthStore } from "@/store";

const DEFAULT_LIMIT = 5;

type UsePendingConfirmationArgs = {
  limit?: number;
};

type UsePendingConfirmationResult = {
  purchases: PurchaseListItem[];
  isLoading: boolean;
  error: PurchasesApiError | null;
  refetch: () => void;
};

export function usePendingConfirmation({
  limit = DEFAULT_LIMIT,
}: UsePendingConfirmationArgs = {}): UsePendingConfirmationResult {
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

    listPurchases({ status: ["pending_confirmation"], limit })
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
