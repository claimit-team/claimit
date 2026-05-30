import { create } from "zustand";

type PendingPrompt = {
  text: string;
  nonce: number;
};

type ClaimAssistantPromptState = {
  pendingByClaimId: Record<string, PendingPrompt | undefined>;
  queuePrompt: (claimId: string, text: string) => void;
  consumePrompt: (claimId: string) => PendingPrompt | null;
  clearPrompt: (claimId: string) => void;
};

let nonceCounter = 0;

export const useClaimAssistantPromptStore = create<ClaimAssistantPromptState>((set, get) => ({
  pendingByClaimId: {},
  queuePrompt: (claimId, text) => {
    nonceCounter += 1;
    set((state) => ({
      pendingByClaimId: {
        ...state.pendingByClaimId,
        [claimId]: { text, nonce: nonceCounter },
      },
    }));
  },
  consumePrompt: (claimId) => {
    const pending = get().pendingByClaimId[claimId] ?? null;
    if (!pending) return null;
    set((state) => {
      const next = { ...state.pendingByClaimId };
      delete next[claimId];
      return { pendingByClaimId: next };
    });
    return pending;
  },
  clearPrompt: (claimId) => {
    set((state) => {
      const next = { ...state.pendingByClaimId };
      delete next[claimId];
      return { pendingByClaimId: next };
    });
  },
}));
