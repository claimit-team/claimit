/**
 * usePurchases — drives the /purchases page.
 *
 * Mirrors `useClaims` 1:1 (audit-tracked PR2 decision: claims-list
 * pattern is the template). Differences:
 *  - Filter is `category` (Retail / Airline / Hotel) instead of
 *    `statusGroup`. Backend supports `status` as a separate filter but
 *    the v0 prompt explicitly forbids a status filter on the list, so
 *    only `category` + debounced `q` are exposed here. A future
 *    "status chip" rollout would add a third field without changing
 *    the rest of the hook.
 *  - No `outcome` / `platform` filters (claims-only concepts on the
 *    list; purchases surface the platform but don't filter by it).
 *  - Response carries `total_count`; we return it for parity but the
 *    page MUST NOT render it (v0 §4 forbids money / totals on the list).
 *
 * Lifecycle / invariants (verbatim from useClaims):
 *  - Wait for AuthInit (`useAuthStore.isLoading === false`).
 *  - `mounted` guards against state writes after unmount.
 *  - `generationRef` invalidates a stale `loadMore` response when the
 *    filter changes mid-flight.
 *  - 300ms `q` debounce.
 *  - `lastQueryKeyRef` powers stale-while-error for SAME-key
 *    refetches — a different-key fetch always clears the rows + cursor
 *    before firing so a failure on the new key shows empty/error (not
 *    stale wrong-filter rows), and a subsequent `loadMore` has no
 *    stale cursor to paginate from.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listPurchases, type PurchaseListItem, PurchasesApiError } from "@/lib/api/purchases";
import { useAuthStore } from "@/store";

const DEFAULT_PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

type UsePurchasesArgs = {
  pageSize?: number;
};

type UsePurchasesResult = {
  purchases: PurchaseListItem[];
  nextCursor: string | null;
  totalCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: PurchasesApiError | null;
  category: string | null;
  setCategory: (category: string | null) => void;
  q: string;
  setQ: (value: string) => void;
  refetch: () => void;
  loadMore: () => Promise<void>;
};

export function usePurchases({
  pageSize = DEFAULT_PAGE_SIZE,
}: UsePurchasesArgs = {}): UsePurchasesResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<PurchasesApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [category, setCategoryState] = useState<string | null>(null);
  const [q, setQState] = useState<string>("");
  const [debouncedQ, setDebouncedQ] = useState<string>("");

  const generationRef = useRef(0);
  const lastQueryKeyRef = useRef<string | null>(null);

  const setCategory = useCallback((next: string | null) => {
    setCategoryState(next);
  }, []);

  const setQ = useCallback((value: string) => {
    setQState(value);
  }, []);

  const refetch = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQ(q.trim());
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [q]);

  const queryKey = `${userId ?? "anon"}|${category ?? "all"}|${debouncedQ}|${pageSize}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick is an intentional refetch trigger; not read inside the effect body
  useEffect(() => {
    generationRef.current += 1;

    const isSameQuery = lastQueryKeyRef.current === queryKey;
    if (!isSameQuery) {
      setPurchases([]);
      setNextCursor(null);
      setTotalCount(0);
    }

    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setPurchases([]);
      setNextCursor(null);
      setTotalCount(0);
      setError(new PurchasesApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      lastQueryKeyRef.current = queryKey;
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    listPurchases({
      category: category ?? undefined,
      q: debouncedQ.length > 0 ? debouncedQ : undefined,
      limit: pageSize,
    })
      .then((page) => {
        if (!mounted) return;
        lastQueryKeyRef.current = queryKey;
        setPurchases(page.purchases);
        setNextCursor(page.next_cursor);
        setTotalCount(page.total_count);
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
        // Stale-while-error: see useClaims for the rationale. Rows from
        // the previous same-key fetch stay so a transient hiccup doesn't
        // blank the list; different-key fetches were cleared above.
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [queryKey, userId, isAuthLoading, category, debouncedQ, pageSize, reloadTick]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    const myGeneration = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await listPurchases({
        category: category ?? undefined,
        q: debouncedQ.length > 0 ? debouncedQ : undefined,
        limit: pageSize,
        cursor: nextCursor,
      });
      if (myGeneration !== generationRef.current) return;
      setError(null);
      setPurchases((prev) => [...prev, ...page.purchases]);
      setNextCursor(page.next_cursor);
      // total_count is for the full filtered set — overwrite (not add)
      // each page so a mid-pagination filter change doesn't accumulate.
      setTotalCount(page.total_count);
    } catch (err) {
      if (myGeneration !== generationRef.current) return;
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
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, category, debouncedQ, pageSize]);

  return {
    purchases,
    nextCursor,
    totalCount,
    isLoading,
    isLoadingMore,
    error,
    category,
    setCategory,
    q,
    setQ,
    refetch,
    loadMore,
  };
}
