// Mock Zustand stores. Each `useXStore` accepts an optional selector
// (Zustand's standard API) and returns its result on a static initial
// state. `.getState()` returns the raw state for direct callers.

type Selector<T, U> = (s: T) => U;

function makeStore<T extends object>(state: T) {
  function useStore(): T;
  function useStore<U>(selector: Selector<T, U>): U;
  function useStore<U>(selector?: Selector<T, U>) {
    return selector ? selector(state) : state;
  }
  // biome-ignore lint/suspicious/noExplicitAny: zustand .getState lookalike
  (useStore as any).getState = () => state;
  // biome-ignore lint/suspicious/noExplicitAny: zustand .setState lookalike
  (useStore as any).setState = () => {};
  return useStore;
}

const uiState = {
  sidebarCollapsed: false,
  claimEmbeddedAssistantExpanded: false,
  setSidebarCollapsed: (_: boolean) => {},
  setClaimEmbeddedAssistantExpanded: (_: boolean) => {},
  toggleClaimEmbeddedAssistant: () => {},
};
export const useUIStore = makeStore(uiState);

const authState = {
  user: {
    gmail_integration: { connected: true },
  } as { gmail_integration?: { connected: boolean } } | null,
  isLoading: false,
  signInError: null,
  setUser: () => {},
  setLoading: () => {},
  setSignInError: () => {},
  signOut: () => {},
};
export const useAuthStore = makeStore(authState);

const promptState = {
  pendingByClaimId: {} as Record<string, string | undefined>,
  queuePrompt: (_: string, __: string) => {},
  consumePrompt: (_: string) => null,
};
export const useClaimAssistantPromptStore = makeStore(promptState);

const refetchState = {
  triggerRefetch: async (_?: string) => {},
};
export const useClaimDetailRefetchStore = makeStore(refetchState);

const redraftState = {
  byClaimId: {} as Record<
    string,
    { startedAt: number; baselineVersion: number; timedOut: boolean }
  >,
  startRegenerating: (_: string, __: number) => {},
  clearRegenerating: (_: string) => {},
  markTimedOut: (_: string) => {},
  isRegenerating: (_: string) => false,
  isTimedOut: (_: string) => false,
};
export const useClaimRedraftProgressStore = makeStore(redraftState);

export const REDRAFT_TIMEOUT_MS = 45_000;
export function normalizeClaimId(claimId: string): string {
  return claimId.trim().toLowerCase();
}

// `@/store/notifications` is read by a few utility paths — surface a
// no-op too so a transitive import doesn't crash.
const notifState = {
  unreadCount: 0,
  recent: [] as Array<{ id: string; title: string }>,
};
export const useNotificationsStore = makeStore(notifState);
