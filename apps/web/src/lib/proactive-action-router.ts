/**
 * Pure helpers used by `floating-assistant.tsx::handleAction` to extract
 * id-shaped fields from the proactive notification payload before routing.
 *
 * Lives in `lib/` (not co-located) so it runs under Vitest's `environment:
 * "node"` config without pulling in the Next.js router. Each helper takes
 * the raw `data` field (typed as `unknown` to match the wire-JSON shape)
 * and narrows it defensively — a missing key, wrong type, or empty string
 * returns `null` so the caller can choose a sensible fallback route
 * instead of building `/claims/undefined` or similar.
 */

function _extractStringId(data: unknown, key: string): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Defensively pull `purchase_id` (string) from a proactive event's data. */
export function extractPurchaseId(data: unknown): string | null {
  return _extractStringId(data, "purchase_id");
}

/**
 * Defensively pull `claim_id` (string) from a proactive event's data.
 *
 * The backend writes `data.claim_id` on every claim_* NotificationEvent
 * (see api-gateway/src/services/claims_service.py). Returning null when
 * the field is missing or malformed lets the action router fall back to
 * the /claims index instead of pushing /claims/undefined.
 */
export function extractClaimId(data: unknown): string | null {
  return _extractStringId(data, "claim_id");
}
