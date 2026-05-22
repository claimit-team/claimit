/**
 * Claim detail refetch registry (ticket 5.9).
 *
 * The claim page registers its `refetch` callback so SSE fanouts
 * (claim_drafted, update_send_override completion) can refresh the
 * wire bundle without a second EventSource or prop drilling through
 * AssistantPane.
 */

import { create } from "zustand";

type RefetchFn = () => Promise<void>;

type ClaimDetailRefetchState = {
  /** claimId → refetch callback for the currently mounted detail page. */
  handlers: Map<string, RefetchFn>;
  register: (claimId: string, refetch: RefetchFn) => void;
  unregister: (claimId: string) => void;
  triggerRefetch: (claimId: string) => Promise<void>;
};

export const useClaimDetailRefetchStore = create<ClaimDetailRefetchState>((set, get) => ({
  handlers: new Map(),
  register: (claimId, refetch) =>
    set((state) => {
      const next = new Map(state.handlers);
      next.set(claimId, refetch);
      return { handlers: next };
    }),
  unregister: (claimId) =>
    set((state) => {
      const next = new Map(state.handlers);
      next.delete(claimId);
      return { handlers: next };
    }),
  triggerRefetch: async (claimId) => {
    const fn = get().handlers.get(claimId);
    if (!fn) return;
    try {
      await fn();
    } catch {
      // Refetch failures are surfaced by the page's existing error paths;
      // SSE fanout should not throw into the notifications stream.
    }
  },
}));
