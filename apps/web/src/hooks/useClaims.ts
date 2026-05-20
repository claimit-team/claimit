/**
 * useClaims — drives the /claims page.
 *
 * Pattern mirrors useNotifications:
 * - Wait for AuthInit (useAuthStore.isLoading === false).
 * - mounted-flag guards against state updates after unmount.
 * - generationRef invalidates stale loadMore responses when filter
 *   changes mid-flight.
 * - Debounces the search box (300ms) to avoid hammering the backend on
 *   every keystroke.
 *
 * Filter semantics:
 * - `statusGroup` and the debounced `q` are sent as query params and
 *   reset the cursor / list when they change. Both are server-side
 *   filters (the cursor is computed against the post-filter result set
 *   so "Load more" stays correct).
 * - `q` is mirrored as both a controlled input value (`q`) and the
 *   debounced value (`debouncedQ`) so the input stays responsive while
 *   network calls fire on settle.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type ClaimListItem, ClaimsApiError, listClaims, type StatusGroup } from "@/lib/api/claims";
import { useAuthStore } from "@/store";

const DEFAULT_PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

type UseClaimsArgs = {
  pageSize?: number;
};

type UseClaimsResult = {
  claims: ClaimListItem[];
  nextCursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: ClaimsApiError | null;
  statusGroup: StatusGroup | null;
  setStatusGroup: (group: StatusGroup | null) => void;
  q: string;
  setQ: (value: string) => void;
  refetch: () => void;
  loadMore: () => Promise<void>;
};

export function useClaims({ pageSize = DEFAULT_PAGE_SIZE }: UseClaimsArgs = {}): UseClaimsResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [claims, setClaims] = useState<ClaimListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<ClaimsApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [statusGroup, setStatusGroupState] = useState<StatusGroup | null>(null);
  // Two `q` values: `q` is the controlled input (instant, no fetch) and
  // `debouncedQ` is the value that drives the actual API call. Splitting
  // them keeps the input snappy while preventing per-keystroke fetches.
  const [q, setQState] = useState<string>("");
  const [debouncedQ, setDebouncedQ] = useState<string>("");

  // Bumped on every first-page-load (filter/search change, auth flip,
  // manual refetch). loadMore captures the value at call time and aborts
  // its state mutations if the generation has drifted by the time its
  // response lands — protects the list from stale results contaminating
  // the new filter.
  const generationRef = useRef(0);

  const setStatusGroup = useCallback((group: StatusGroup | null) => {
    setStatusGroupState(group);
  }, []);

  const setQ = useCallback((value: string) => {
    setQState(value);
  }, []);

  const refetch = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  // Debounce the search input. 300ms is short enough that the user
  // perceives the list refresh as immediate but long enough to drop
  // most keystroke-spam fetches.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQ(q.trim());
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [q]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    // Bump first so any in-flight loadMore (started under the previous
    // generation) is invalidated regardless of which branch we take below.
    generationRef.current += 1;

    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setClaims([]);
      setNextCursor(null);
      setError(new ClaimsApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    listClaims({
      status_group: statusGroup ?? undefined,
      q: debouncedQ.length > 0 ? debouncedQ : undefined,
      limit: pageSize,
    })
      .then((page) => {
        if (!mounted) return;
        setClaims(page.claims);
        setNextCursor(page.next_cursor);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
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
        // Stale-while-error: keep the previously rendered page so a
        // transient hiccup doesn't blank the entire list.
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, isAuthLoading, statusGroup, debouncedQ, pageSize, reloadTick]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    // Snapshot the generation at request start. If a filter/search
    // changes (or auth flips, or refetch) before the response lands,
    // the effect above bumps generationRef.current and we drop the data
    // writes — applying them on top of a new filter's data would
    // corrupt the list. The UI loading flag (setIsLoadingMore) is
    // intentionally NOT gated by generation: this request is done
    // either way and the "Load more" button must release.
    const myGeneration = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await listClaims({
        status_group: statusGroup ?? undefined,
        q: debouncedQ.length > 0 ? debouncedQ : undefined,
        limit: pageSize,
        cursor: nextCursor,
      });
      if (myGeneration !== generationRef.current) return;
      setError(null);
      setClaims((prev) => [...prev, ...page.claims]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      if (myGeneration !== generationRef.current) return;
      if (err instanceof ClaimsApiError) {
        setError(err);
      } else {
        setError(
          new ClaimsApiError("unknown_error", err instanceof Error ? err.message : "Unknown error"),
        );
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, statusGroup, debouncedQ, pageSize]);

  return {
    claims,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    statusGroup,
    setStatusGroup,
    q,
    setQ,
    refetch,
    loadMore,
  };
}
