/**
 * Display formatters for claim data: currency, remaining time.
 *
 * Moved here from `lib/claim-detail.ts` (removed as part of BUG-128
 * dead-code cleanup). Canonical location for claim-related formatters
 * going forward.
 */

export function formatClaimCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatClaimRemainingTime(hours: number): string {
  if (hours <= 0) return "Expired";
  const days = Math.ceil(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} remaining`;
  return `${remainingHours} hour${remainingHours !== 1 ? "s" : ""} remaining`;
}
