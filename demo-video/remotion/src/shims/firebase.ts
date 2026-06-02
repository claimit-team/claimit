// Stub for `@/lib/firebase` — the only export we care about is `auth`,
// which other code reads `.currentUser?.getIdToken()` from. A fake
// currentUser that never resolves a token is fine since we also stub
// the API client.

export const auth = {
  currentUser: null as null | { getIdToken: () => Promise<string> },
};
