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
  debouncedQ: string;
  counts: Record<string, number>;
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
  const [counts, setCounts] = useState<Record<string, number>>({});

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

  // Last query key successfully serving the rows currently in `claims`.
  // Used to scope stale-while-error to SAME-key refetches. When the user
  // changes statusGroup / q (or signs in/out), the effect compares the
  // new key against this ref; if they differ, it clears claims +
  // nextCursor BEFORE the fetch so a failure on the new key shows
  // empty/error state (not stale wrong-filter rows) and a subsequent
  // loadMore has no stale cursor to paginate from.
  const lastQueryKeyRef = useRef<string | null>(null);

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

  // Composite key for "what filter/search is the current claims[] showing".
  // Re-evaluated each render; the effect below treats a change vs
  // lastQueryKeyRef as a hard reset (clear claims + cursor before fetching),
  // and a match as same-query refetch (stale-while-error preserves rows).
  const queryKey = `${userId ?? "anon"}|${statusGroup ?? "all"}|${debouncedQ}|${pageSize}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    // Bump first so any in-flight loadMore (started under the previous
    // generation) is invalidated regardless of which branch we take below.
    generationRef.current += 1;

    // Hard reset on a query-key change — see lastQueryKeyRef docstring.
    // A failed first-page fetch must NOT leave stale rows under the new
    // filter, and loadMore must not paginate from the previous query's
    // cursor. Same-key refetches (manual refetch tick or transient
    // re-render) keep stale-while-error behavior.
    const isSameQuery = lastQueryKeyRef.current === queryKey;
    if (!isSameQuery) {
      setClaims([]);
      setNextCursor(null);
    }

    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setClaims([]);
      setNextCursor(null);
      setError(new ClaimsApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      // Mark the unauth state as "served" so the next render with the
      // same null-userId doesn't re-clear (no-op, but keeps the
      // invariant clean).
      lastQueryKeyRef.current = queryKey;
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
        // Commit the new query key only on success — if the fetch fails
        // the ref stays on the LAST known-good key so the next render
        // (a retry of the new key) keeps clearing rows pre-fetch
        // instead of accidentally treating a failed-then-retried new
        // key as a "same-query" refetch.
        lastQueryKeyRef.current = queryKey;
        setClaims(page.claims);
        setNextCursor(page.next_cursor);
        setCounts(page.counts ?? {});
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
        // Stale-while-error semantics:
        // - Same-query refetch failed -> keep the previously rendered
        //   rows so a transient hiccup doesn't blank the list.
        // - Different-query fetch failed -> rows + cursor were already
        //   cleared above, and we deliberately do NOT commit
        //   lastQueryKeyRef, so a subsequent retry of this same key
        //   still treats it as a fresh query and shows empty/error.
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [queryKey, userId, isAuthLoading, statusGroup, debouncedQ, pageSize, reloadTick]);

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
    debouncedQ,
    counts,
    refetch,
    loadMore,
  };
}
