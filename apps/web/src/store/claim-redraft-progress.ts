/**
 * Tracks in-flight assistant-driven redrafts per claim (ticket 5.9 follow-up).
 *
 * Started when the claim-focused assistant invokes `request_redraft`;
 * cleared when claim_drafted refetch lands or the 45s timeout fires.
 */

import { create } from "zustand";

const REDRAFT_TIMEOUT_MS = 45_000;

type RedraftProgress = {
  startedAt: number;
  baselineVersion: number;
  timedOut: boolean;
};

type ClaimRedraftProgressState = {
  byClaimId: Map<string, RedraftProgress>;
  startRegenerating: (claimId: string, baselineVersion: number) => void;
  clearRegenerating: (claimId: string) => void;
  markTimedOut: (claimId: string) => void;
  isRegenerating: (claimId: string) => boolean;
  isTimedOut: (claimId: string) => boolean;
  getProgress: (claimId: string) => RedraftProgress | undefined;
};

export const useClaimRedraftProgressStore = create<ClaimRedraftProgressState>((set, get) => ({
  byClaimId: new Map(),
  startRegenerating: (claimId, baselineVersion) =>
    set((state) => {
      const next = new Map(state.byClaimId);
      next.set(claimId, {
        startedAt: Date.now(),
        baselineVersion,
        timedOut: false,
      });
      return { byClaimId: next };
    }),
  clearRegenerating: (claimId) =>
    set((state) => {
      if (!state.byClaimId.has(claimId)) return state;
      const next = new Map(state.byClaimId);
      next.delete(claimId);
      return { byClaimId: next };
    }),
  markTimedOut: (claimId) =>
    set((state) => {
      const current = state.byClaimId.get(claimId);
      if (!current) return state;
      const next = new Map(state.byClaimId);
      next.set(claimId, { ...current, timedOut: true });
      return { byClaimId: next };
    }),
  isRegenerating: (claimId) => {
    const progress = get().byClaimId.get(claimId);
    return progress !== undefined && !progress.timedOut;
  },
  isTimedOut: (claimId) => get().byClaimId.get(claimId)?.timedOut ?? false,
  getProgress: (claimId) => get().byClaimId.get(claimId),
}));

export { REDRAFT_TIMEOUT_MS };
