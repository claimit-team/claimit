/**
 * Auto-send banner store — drives the dashboard's
 * "Sending {platform} claim in M:SS" countdown banner (ticket 5.15 /
 * WI-9). One row per queued-for-send claim, stacked vertically (max
 * 3 visible per the locked-color design; overflow surfaces as
 * "+N more sending").
 *
 * Data flow:
 *   1. Initial load: useQueuedForSendClaims fetches
 *      GET /claims?outcome=queued_for_send and replaces the store
 *      with `setRows(rows)`.
 *   2. Live updates: useProactiveAssistant's SSE handler fans out
 *      `claim_queued_auto` (new queued claim → addRow) and
 *      `claim_submitted` (server-confirmed send → markSent) into
 *      this store.
 *   3. Banner-local interval drives the countdown re-render; the
 *      store itself doesn't tick (no per-second writes that would
 *      thrash every subscriber).
 *
 * Per-row state machine (`state`):
 *   - `queued`: live countdown + Send-now/Cancel actions.
 *   - `sent`:   "Sent ✓" surface, scheduled for auto-dismissal
 *               ~3s later (Sonner-like). The banner component
 *               handles the timer; the store just flips the state.
 *
 * The store owns the rows + state flips ONLY; per-row dismissal
 * timers live in the banner component so a re-render of the
 * dashboard doesn't lose them. Optimistic Send-now / Cancel from
 * the banner remove the row immediately (matching the SSE-driven
 * flow); a 409 from the gateway is treated as "already sent" per
 * H3 — same removal path, no error toast.
 */

import { create } from "zustand";

export type AutoSendBannerRow = {
  claimId: string;
  platform: string;
  autoSendAt: string;
  state: "queued" | "sent";
};

type AutoSendBannerState = {
  rows: AutoSendBannerRow[];
  /** Replace the entire set — used by the initial fetch hook. */
  setRows: (rows: AutoSendBannerRow[]) => void;
  /**
   * Add a row IF its claimId isn't already in the store. Idempotent
   * by claimId so an SSE `claim_queued_auto` that arrives after the
   * initial fetch doesn't double-insert.
   */
  addRow: (row: AutoSendBannerRow) => void;
  /**
   * Flip a row to `sent` (or no-op if the claimId isn't present —
   * an SSE submitted event for an already-removed banner row).
   * The banner component schedules the row's removal ~3s later.
   */
  markSent: (claimId: string) => void;
  /** Remove a row by claimId — used after Send-now / Cancel and on auto-dismiss. */
  removeRow: (claimId: string) => void;
  /** Auth flip → drop all rows so a logged-out shell doesn't keep them. */
  resetOnSignOut: () => void;
};

export const useAutoSendBannerStore = create<AutoSendBannerState>((set) => ({
  rows: [],
  setRows: (rows) => set({ rows }),
  addRow: (row) =>
    set((state) => {
      if (state.rows.some((r) => r.claimId === row.claimId)) return state;
      return { rows: [...state.rows, row] };
    }),
  markSent: (claimId) =>
    set((state) => ({
      rows: state.rows.map((row) =>
        row.claimId === claimId ? { ...row, state: "sent" as const } : row,
      ),
    })),
  removeRow: (claimId) =>
    set((state) => ({
      rows: state.rows.filter((row) => row.claimId !== claimId),
    })),
  resetOnSignOut: () => set({ rows: [] }),
}));
