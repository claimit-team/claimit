/**
 * useDashboardSummary — fetches GET /api/v1/dashboard/summary once the
 * authenticated user is known, exposing { summary, isLoading, error, refetch }.
 *
 * Lifecycle:
 *   - Wait for AuthInit to finish (useAuthStore.isLoading === false).
 *   - If a user is signed in, call getDashboardSummary().
 *   - Re-fetch when the user.id changes (e.g. account switch).
 *   - A mounted-flag pattern guards against state updates after unmount.
 *
 * Error model: errors are surfaced as DashboardApiError; callers decide
 * how to render them (skeleton / inline error banner / hard-fail).
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardApiError, type DashboardSummary, getDashboardSummary } from "@/lib/api/dashboard";
import { useAuthStore } from "@/store";

type UseDashboardSummaryResult = {
  summary: DashboardSummary | null;
  isLoading: boolean;
  error: DashboardApiError | null;
  refetch: () => void;
};

export function useDashboardSummary(): UseDashboardSummaryResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<DashboardApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const refetch = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    // Hold the loading state while AuthInit resolves. Once auth is done
    // and there is no user, surface that as an explicit "unauthenticated"
    // error rather than infinitely loading.
    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setSummary(null);
      setError(new DashboardApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    getDashboardSummary()
      .then((data) => {
        if (!mounted) return;
        setSummary(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        if (err instanceof DashboardApiError) {
          setError(err);
        } else {
          setError(
            new DashboardApiError(
              "unknown_error",
              err instanceof Error ? err.message : "Unknown error",
            ),
          );
        }
        // Stale-while-error: deliberately keep the previously-fetched
        // summary so transient backend hiccups don't collapse the
        // dashboard layout. The page derives userState from summary,
        // and falling back to null would force the layout into the
        // "new user" empty state, hiding NeedsAttention /
        // MonitoredPurchases / RecentActivity for users who already
        // have data. Initial-load failures keep summary at its
        // initial null, which gracefully renders the new-user empty
        // state — same behavior as before.
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, isAuthLoading, reloadTick]);

  return { summary, isLoading, error, refetch };
}
