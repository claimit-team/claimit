// Stub for `next/navigation` hooks. Components that call useRouter /
// useParams / usePathname during render need _something_ — we return
// safe no-ops so render doesn't throw.

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: async () => {},
  } as const;
}

export function useParams<T extends Record<string, string | string[]>>(): T {
  return {} as T;
}

export function usePathname(): string {
  return "/";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function notFound(): never {
  throw new Error("notFound() called in Remotion stub");
}

export function redirect(_url: string): never {
  throw new Error("redirect() called in Remotion stub");
}
