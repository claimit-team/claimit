/**
 * useReviewDraft — small, dedicated fetch for the dashboard's
 * "Needs your attention" section (the `review_draft` cards).
 *
 * Mirrors the shape of `usePendingConfirmation` and
 * `useMonitoredPurchases`:
 *   - small fixed slice (5 rows by default), never paginated;
 *   - no search/filter UI;
 *   - non-blocking error state — the dashboard never blocks render.
 *
 * Scoped to `outcome=draft_pending` only. Surfaces the top-N claims
 * the user can still approve/cancel/edit. When the call fails or
 * returns zero, the dashboard simply omits the `review_draft` section
 * (matches the `confirm_extraction` empty-state semantics) — we'd
 * rather under-surface than render a fake error inside a multi-card
 * section.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type ClaimListItem, ClaimsApiError, listClaims } from "@/lib/api/claims";
import { useAuthStore } from "@/store";

const DEFAULT_LIMIT = 5;

type UseReviewDraftArgs = {
  limit?: number;
};

type UseReviewDraftResult = {
  claims: ClaimListItem[];
  isLoading: boolean;
  error: ClaimsApiError | null;
  refetch: () => void;
};

export function useReviewDraft({
  limit = DEFAULT_LIMIT,
}: UseReviewDraftArgs = {}): UseReviewDraftResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [claims, setClaims] = useState<ClaimListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ClaimsApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  /**
   * Per-instance request-sequence counter. Each effect run increments
   * it and captures the new value into a local; the .then / .catch /
   * .finally handlers only commit state if the captured sequence
   * still matches `requestSeqRef.current` (and `mounted`). Guards
   * against rapid refetches (or an args change that re-fires the
   * effect mid-fetch) racing each other and a stale older response
   * clobbering a newer one (CodeRabbit MAJOR, PR #168).
   */
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

    listClaims({ outcome: "draft_pending", limit })
      .then((page) => {
        if (!mounted || requestSeq !== requestSeqRef.current) return;
        setClaims(page.claims);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted || requestSeq !== requestSeqRef.current) return;
        // Clear stale rows so the dashboard's "Review draft" cards
        // disappear on fetch failure — otherwise a transient error
        // would keep showing previously-fetched cards alongside the
        // error state (CodeRabbit MAJOR finding, PR #168). The
        // section is non-blocking by design (see header docstring),
        // so an empty array + error flag is the correct stale state.
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
