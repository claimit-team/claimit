/**
 * Small presentational helpers for claim list/detail rows.
 *
 * `formatWindowRemaining` delegates to `formatClaimRemainingTime` from
 * `@/lib/claim-format` (which the detail page already uses) so the same
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
import type { ClaimDetailWorkflowStatus } from "@/lib/claim-detail-types";
import { formatClaimRemainingTime } from "@/lib/claim-format";
import { getPlatformLabel } from "@/lib/platform-labels";

export const EDITABLE_STATUSES = new Set<ClaimDetailWorkflowStatus>(["awaiting_approval"]);

/**
 * Convert an unknown enum-ish string into a human-friendly Title Case
 * label by splitting on `_` and capitalising the first word. Used as
 * the safe-fallback branch on every claim/purchase enum→label consumer
 * — see PR #142 (read-tolerance) for why the backend now returns
 * verbatim legacy values like `"price_drop_refund"` rather than 500ing.
 *
 * Examples:
 *   "price_drop_refund" → "Price drop refund"
 *   "best_buy"          → "Best buy"
 *   ""                  → "—"
 *   null/undefined      → "—"
 */
export function snakeToTitleLabel(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const parts = raw.split("_").filter(Boolean);
  if (parts.length === 0) return "—";
  const [first, ...rest] = parts;
  // Capitalise the first word; remaining words stay lowercase. Reads as
  // a sentence ("Price drop refund") rather than Title Case All Words.
  const capitalised = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  if (rest.length === 0) return capitalised;
  return `${capitalised} ${rest.join(" ").toLowerCase()}`;
}

/**
 * Brand-style platform label: `best_buy` → `Best Buy`, `hilton` → `Hilton`.
 * Delegates to the canonical `getPlatformLabel` in `lib/platform-labels.ts`.
 */
export const toPlatformLabel = getPlatformLabel;

/**
 * `outcome` may be `null` (legacy doc never populated it) or a string
 * the current `ClaimOutcome` enum no longer recognises (PR #142). Both
 * cases land in `resolved` — better to surface the row in the most
 * generic chip than to throw.
 */
export function outcomeToGroup(outcome: ClaimOutcome | string | null | undefined): StatusGroup {
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
    default:
      return "resolved";
  }
}

/**
 * Maps a `ClaimType` enum value to its display label, with a Title Case
 * fallback for legacy/unknown values returned by a read-tolerant
 * backend. The backend can now surface values like `"price_drop_refund"`
 * (a pre-2.2 enum value still living in production data) — rendering
 * "Price drop refund" is preferable to crashing.
 */
export function claimTypeLabel(claimType: ClaimType | string | null | undefined): string {
  switch (claimType) {
    case "email":
      return "Email";
    case "chat_script":
      return "Chat script";
    case "in_store":
      return "In store";
    case "self_service":
      return "Self service";
    default:
      return snakeToTitleLabel(claimType);
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
  const hoursRemaining = Math.ceil((expiresMs - Date.now()) / (60 * 60 * 1000));
  return formatClaimRemainingTime(hoursRemaining);
}

/**
 * Relative copy for a claim's `submitted_at` timestamp.
 * Shared by the /claims list and dashboard awaiting-outcome cards.
 */
export function formatRelativeFromNow(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (days < 1) return "Submitted today";
  if (days === 1) return "Submitted 1 day ago";
  return `Submitted ${days} days ago`;
}
