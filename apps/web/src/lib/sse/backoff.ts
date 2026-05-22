/** Shared exponential backoff for SSE reconnect (ticket 5.11). */

export type BackoffOptions = {
  baseMs?: number;
  maxMs?: number;
};

export function computeBackoffMs(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? 1000;
  const maxMs = options.maxMs ?? 30_000;
  const exponent = Math.max(0, attempt);
  return Math.min(baseMs * 2 ** exponent, maxMs);
}
