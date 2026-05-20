/**
 * Small presentational helpers for claim list/detail rows.
 *
 * `formatWindowRemaining` delegates to `formatClaimRemainingTime` from
 * `@/lib/claim-detail` (which the detail page already uses) so the same
 * "11 days remaining" / "Expired" copy is shared between list and detail.
 *
 * `outcomeToGroup` is the inverse of the server's STATUS_GROUP_OUTCOMES
 * mapping (apps/api-gateway/src/services/claims_service.py): given an
 * outcome on a returned ClaimListItem, return the StatusGroup chip that
 * would surface it. Useful for highlighting the right chip when a
 * specific outcome was selected and for client-side fallback grouping.
 */

import type { ClaimOutcome, ClaimType } from "@claimit/mongodb-types";
import type { StatusGroup } from "@/lib/api/claims";
import { formatClaimRemainingTime } from "@/lib/claim-detail";

export function outcomeToGroup(outcome: ClaimOutcome): StatusGroup {
  switch (outcome) {
    case "draft_pending":
      return "pending";
    case "pending":
      return "in_progress";
    case "approved":
    case "denied":
    case "expired":
    case "user_self_service":
    case "user_cancelled":
    case "no_response":
      return "resolved";
    default: {
      // exhaustiveness check — the never type ensures all variants handled
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

export function claimTypeLabel(claimType: ClaimType): string {
  switch (claimType) {
    case "email":
      return "Email";
    case "chat_script":
      return "Chat script";
    case "in_store":
      return "In store";
    case "self_service":
      return "Self service";
    default: {
      const _exhaustive: never = claimType;
      return _exhaustive;
    }
  }
}

/**
 * Format the time remaining until a Purchase's `window_expires`.
 *
 * Server returns `window_expires` as an absolute ISO timestamp and the
 * countdown is computed at render time, so the displayed delta refresh
 * naturally on each re-render without needing a server round-trip. Null
 * input (orphan claim or unknown window) renders as a dash.
 */
export function formatWindowRemaining(windowExpires: string | null): string {
  if (windowExpires === null) return "—";
  const expiresMs = Date.parse(windowExpires);
  if (Number.isNaN(expiresMs)) return "—";
  const hoursRemaining = Math.floor((expiresMs - Date.now()) / (60 * 60 * 1000));
  return formatClaimRemainingTime(hoursRemaining);
}
