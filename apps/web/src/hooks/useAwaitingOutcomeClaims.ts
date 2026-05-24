/**
 * useAwaitingOutcomeClaims — small, dedicated fetch for the dashboard's
 * "Needs your attention" section (the `awaiting_outcome` cards).
 *
 * Mirrors the shape of `useReviewDraft` and `usePendingConfirmation`:
 *   - small fixed slice (10 rows by default), never paginated;
 *   - no search/filter UI;
 *   - non-blocking error state — the dashboard never blocks render.
 *
 * Scoped to `outcome=pending` only. The dashboard applies a client-side
 * >= N-day filter on `submitted_at` before rendering cards, so we fetch
 * a slightly larger slice than the visible card count.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type ClaimListItem, ClaimsApiError, listClaims } from "@/lib/api/claims";
import { useAuthStore } from "@/store";

const DEFAULT_LIMIT = 10;

type UseAwaitingOutcomeClaimsArgs = {
  limit?: number;
};

type UseAwaitingOutcomeClaimsResult = {
  claims: ClaimListItem[];
  isLoading: boolean;
  error: ClaimsApiError | null;
  refetch: () => void;
};

export function useAwaitingOutcomeClaims({
  limit = DEFAULT_LIMIT,
}: UseAwaitingOutcomeClaimsArgs = {}): UseAwaitingOutcomeClaimsResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [claims, setClaims] = useState<ClaimListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ClaimsApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const requestSeqRef = useRef(0);

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
      setClaims([]);
      setError(new ClaimsApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      return;
    }

    let mounted = true;
    const requestSeq = ++requestSeqRef.current;
    setIsLoading(true);
    setError(null);

    listClaims({ outcome: "pending", limit })
      .then((page) => {
        if (!mounted || requestSeq !== requestSeqRef.current) return;
        setClaims(page.claims);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted || requestSeq !== requestSeqRef.current) return;
        setClaims([]);
        if (err instanceof ClaimsApiError) {
          setError(err);
        } else {
          setError(
            new ClaimsApiError(
              "unknown_error",
              err instanceof Error ? err.message : "Unknown error",
            ),
          );
        }
      })
      .finally(() => {
        if (!mounted || requestSeq !== requestSeqRef.current) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, isAuthLoading, limit, reloadTick]);

  return { claims, isLoading, error, refetch };
}
