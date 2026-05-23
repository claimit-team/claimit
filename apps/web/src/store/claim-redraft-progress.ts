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
  byClaimId: Record<string, RedraftProgress>;
  startRegenerating: (claimId: string, baselineVersion: number) => void;
  clearRegenerating: (claimId: string) => void;
  markTimedOut: (claimId: string) => void;
  isRegenerating: (claimId: string) => boolean;
  isTimedOut: (claimId: string) => boolean;
};

export function normalizeClaimId(claimId: string): string {
  return claimId.trim().toLowerCase();
}

export const useClaimRedraftProgressStore = create<ClaimRedraftProgressState>((set, get) => ({
  byClaimId: {},
  startRegenerating: (claimId, baselineVersion) => {
    const key = normalizeClaimId(claimId);
    set((state) => ({
      byClaimId: {
        ...state.byClaimId,
        [key]: {
          startedAt: Date.now(),
          baselineVersion,
          timedOut: false,
        },
      },
    }));
  },
  clearRegenerating: (claimId) => {
    const key = normalizeClaimId(claimId);
    set((state) => {
      if (!(key in state.byClaimId)) return state;
      const { [key]: _removed, ...rest } = state.byClaimId;
      return { byClaimId: rest };
    });
  },
  markTimedOut: (claimId) => {
    const key = normalizeClaimId(claimId);
    set((state) => {
      const current = state.byClaimId[key];
      if (!current) return state;
      return {
        byClaimId: {
          ...state.byClaimId,
          [key]: { ...current, timedOut: true },
        },
      };
    });
  },
  isRegenerating: (claimId) => {
    const progress = get().byClaimId[normalizeClaimId(claimId)];
    return progress !== undefined && !progress.timedOut;
  },
  isTimedOut: (claimId) => get().byClaimId[normalizeClaimId(claimId)]?.timedOut ?? false,
}));

export { REDRAFT_TIMEOUT_MS };
