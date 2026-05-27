/**
 * Frontend port of the price-protection-window math.
 *
 * `computeWindowDays` mirrors `compute_window_days` in
 * packages/shared/mongodb/claimit_mongodb_models/policy.py — identical
 * branching, including honoring legitimate `window_days === 0`
 * (Amazon) instead of falling back to the default. Behavior must stay
 * in lock-step with the Python helper because the server uses it as
 * the canonical recompute on confirm; the FE only renders an
 * informational banner above the form (BUG-59).
 *
 * `isOutsideWindow` is FE-only and answers the banner's question:
 * does the chosen `purchaseDate` + applicable window land before
 * `now`? Date arithmetic operates on calendar days at UTC-midnight so
 * the result does not drift across DST or user-local timezone.
 */

export const DEFAULT_CLAIM_WINDOW_DAYS = 15;

export type PolicyWindowDoc = {
  platform: string;
  window_days: number;
  window_days_member: number | null;
};

export function computeWindowDays(
  policy: PolicyWindowDoc | null,
  memberTierAtPurchase: string | null,
): number {
  if (policy === null) return DEFAULT_CLAIM_WINDOW_DAYS;
  if (memberTierAtPurchase && policy.window_days_member !== null) {
    return policy.window_days_member;
  }
  return policy.window_days;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export type OutsideWindowResult = {
  outside: boolean;
  windowDays: number;
  daysPast: number;
};

export function isOutsideWindow(args: {
  purchaseDate: Date;
  policy: PolicyWindowDoc | null;
  memberTier: string | null;
  now?: Date;
}): OutsideWindowResult {
  const windowDays = computeWindowDays(args.policy, args.memberTier);
  const now = args.now ?? new Date();
  const purchaseUtcMs = toUtcMidnight(args.purchaseDate);
  const nowUtcMs = toUtcMidnight(now);
  const expiresUtcMs = purchaseUtcMs + windowDays * MS_PER_DAY;
  const outside = nowUtcMs > expiresUtcMs;
  const daysPast = outside ? Math.floor((nowUtcMs - expiresUtcMs) / MS_PER_DAY) : 0;
  return { outside, windowDays, daysPast };
}
