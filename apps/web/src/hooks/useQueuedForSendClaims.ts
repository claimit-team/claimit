/**
 * useQueuedForSendClaims — initial fetch for the dashboard auto-send
 * banner (ticket 5.15 / WI-9). Hydrates the
 * `useAutoSendBannerStore` once on mount with
 * `GET /claims?outcome=queued_for_send` so the user sees existing
 * queued claims (banner is the only surface that shows them) without
 * having to wait for a fresh `claim_queued_auto` SSE frame.
 *
 * After this hydration, all live updates flow through
 * `useProactiveAssistant`'s SSE handler — no polling (see
 * `handleAutoSendBannerFanout` in that hook).
 *
 * Mirrors `useReviewDraft`'s shape:
 *   - small fixed slice (10 — multiple queued claims uncommon in
 *     prod but the banner caps visible at 3 + "+N more sending");
 *   - non-blocking error state (errors silently drop the banner —
 *     the dashboard never blocks render);
 *   - request-sequence ref so a refetch + an effect re-fire don't
 *     race each other.
 */

"use client";

import { useEffect, useRef } from "react";

import { type ClaimListItem, listClaims } from "@/lib/api/claims";
import { useAuthStore } from "@/store";
import { type AutoSendBannerRow, useAutoSendBannerStore } from "@/store/auto-send-banner";

const DEFAULT_LIMIT = 10;

export function useQueuedForSendClaims({ limit = DEFAULT_LIMIT }: { limit?: number } = {}): void {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const setRows = useAutoSendBannerStore((s) => s.setRows);

  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!userId) {
      setRows([]);
      return;
    }

    let mounted = true;
    const requestSeq = ++requestSeqRef.current;

    listClaims({ outcome: "queued_for_send", limit })
      .then((page) => {
        if (!mounted || requestSeq !== requestSeqRef.current) return;
        const rows: AutoSendBannerRow[] = page.claims
          .map((item) => toBannerRow(item))
          .filter((r): r is AutoSendBannerRow => r !== null);
        setRows(rows);
      })
      .catch((err: unknown) => {
        if (!mounted || requestSeq !== requestSeqRef.current) return;
        // Non-blocking by design — a 5xx or auth blip silently
        // hides the banner; the SSE stream will repopulate it on
        // the next claim_queued_auto frame. Logging the error keeps
        // a paper trail for prod debugging.
        // Silent failure by design — the banner is non-blocking and
        // the SSE stream will repopulate it on the next
        // claim_queued_auto frame. We swallow the error so a
        // transient blip doesn't leak through the dashboard.
        void err;
        setRows([]);
      });

    return () => {
      mounted = false;
    };
  }, [userId, isAuthLoading, limit, setRows]);
}

/**
 * Map a wire `ClaimListItem` into the banner row shape. Returns
 * null for any row missing the auto_send_at marker — those can't
 * drive a countdown so they belong nowhere on the banner. Should
 * never happen in practice for `outcome=queued_for_send`
 * (handle_auto_mode sets both at the same time), but the type is
 * tolerant so we mirror that here.
 */
function toBannerRow(item: ClaimListItem): AutoSendBannerRow | null {
  if (!item._id || !item.auto_send_at) return null;
  return {
    claimId: item._id,
    platform: typeof item.platform === "string" ? item.platform : "claim",
    autoSendAt: item.auto_send_at,
    state: "queued",
  };
}
