/**
 * Purchase status helpers — single source of truth for "what does
 * Purchase X look like on the detail header?".
 *
 * Two layers:
 *
 * 1. The BACKEND `PurchaseStatus` enum (8 values, defined in
 *    packages/shared/mongodb/types.ts): pending_confirmation,
 *    pending_user_edit, monitoring, monitoring_degraded, claimed,
 *    expired, refunded, dismissed.
 *
 * 2. The UI-derived `PurchaseDetailMonitoringStatus` (6 values, defined
 *    in lib/purchase-detail-view.ts): monitoring, eligible_drop,
 *    claim_active, claim_resolved, window_expired, stopped.
 *
 * `deriveMonitoringStatus` collapses (1) -> (2) and folds in a related-
 * claim hint so a monitoring purchase with a draft_pending claim
 * surfaces as "eligible_drop" (the v0-prompt §1 "drop detected, draft
 * ready" header state).
 *
 * Read-tolerance: every helper here accepts `PurchaseStatus | string |
 * null | undefined` and falls through to a safe default. A backend that
 * surfaces a legacy/unknown status string (PR #142) renders as
 * "Monitoring" (the most generous interpretation) rather than crashing
 * the header.
 */

import type { ClaimOutcome, PurchaseStatus } from "@claimit/mongodb-types";

import type { PurchaseDetailMonitoringStatus } from "@/lib/purchase-detail-view";

/** Display config for the header status badge. */
export type PurchaseStatusBadge = {
  label: string;
  /** Tailwind className applied directly to the Badge — see header. */
  className: string;
};

/**
 * Resolve a header badge for a UI-derived monitoring status. Defined
 * here (not in purchase-page-header.tsx) so the same status -> badge
 * mapping is used by anything else that surfaces "this purchase is X"
 * (future dashboard cards, FloatingAssistant mode-B preload, etc.).
 *
 * Visual conventions (per v0 prompt §1, master design doc §14):
 * - "Monitoring" / "Claim active" -> brand-primary (in-progress, calm).
 * - "Eligible drop" -> semantic-warning (action needed but not error).
 * - "Refund received" -> semantic-success (positive resolution).
 * - "Window expired" -> semantic-danger (closed, no recovery path).
 * - "Stopped" / Unknown -> neutral (off-state, no signal).
 *
 * Critically: NEVER `brand-accent-500` here. brand-accent is reserved
 * for "money reclaimed" surfaces (master doc §14); the monitoring
 * status itself is metadata, not a money signal.
 */
const BADGE_BY_MONITORING_STATUS: Record<PurchaseDetailMonitoringStatus, PurchaseStatusBadge> = {
  monitoring: {
    label: "Monitoring",
    className: "bg-brand-primary-500/10 text-brand-primary-500 border-brand-primary-500/20",
  },
  eligible_drop: {
    label: "Eligible drop",
    className: "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20",
  },
  claim_active: {
    label: "Claim active",
    className: "bg-brand-primary-500/10 text-brand-primary-500 border-brand-primary-500/20",
  },
  claim_resolved: {
    label: "Refund received",
    className: "bg-semantic-success/10 text-semantic-success border-semantic-success/20",
  },
  window_expired: {
    label: "Window expired",
    className: "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
  },
  stopped: {
    label: "Stopped",
    className: "bg-neutral-100 text-neutral-500 border-neutral-200",
  },
};

/**
 * Map the BACKEND `PurchaseStatus` to the UI-derived monitoring status.
 *
 * `monitoring_degraded` collapses into `monitoring` for the badge
 * label (the user sees "Monitoring") but consumers that care about the
 * degraded signal (banner, FAB) can re-check the raw status separately.
 * Pending_confirmation / pending_user_edit also surface as Monitoring
 * — the detail page is the wrong context to action either (user is
 * routed to /confirm for those).
 *
 * Unknown / null values default to `monitoring` rather than `stopped`
 * so a read-tolerant backend that surfaces a rogue status string still
 * displays as a live purchase (the same generous fallback as the rest
 * of the read-tolerance contract).
 */
function mapBackendStatus(status: PurchaseStatus | string | null | undefined): {
  monitoring: PurchaseDetailMonitoringStatus;
  isDegraded: boolean;
} {
  switch (status) {
    case "monitoring":
      return { monitoring: "monitoring", isDegraded: false };
    case "monitoring_degraded":
      return { monitoring: "monitoring", isDegraded: true };
    case "pending_confirmation":
    case "pending_user_edit":
      // Detail page is the wrong place to confirm/edit; surface as
      // Monitoring (user navigates to /confirm via the dashboard CTA).
      return { monitoring: "monitoring", isDegraded: false };
    case "claimed":
      return { monitoring: "claim_active", isDegraded: false };
    case "refunded":
      return { monitoring: "claim_resolved", isDegraded: false };
    case "expired":
      return { monitoring: "window_expired", isDegraded: false };
    case "dismissed":
      return { monitoring: "stopped", isDegraded: false };
    default:
      // Unknown / null / legacy string -> generous default.
      return { monitoring: "monitoring", isDegraded: false };
  }
}

/**
 * Derive the UI monitoring status from a purchase + its related-claims
 * list. The claims list is needed because the v0-prompt "eligible_drop"
 * state isn't a backend status — it's the combination of
 * (status=monitoring) AND (one of the related claims is draft_pending).
 *
 * Precedence:
 *   1. Backend status -> base mapping via `mapBackendStatus`.
 *   2. If base is "monitoring" AND there's a draft_pending claim ->
 *      promote to "eligible_drop" (the "drop detected, draft ready"
 *      header state, with "View draft claim" CTA).
 *
 * Resolved/expired/stopped never get promoted — those states have
 * already resolved past the drop signal.
 */
export function deriveMonitoringStatus(
  status: PurchaseStatus | string | null | undefined,
  claimOutcomes: ReadonlyArray<ClaimOutcome | string | null>,
): PurchaseDetailMonitoringStatus {
  const base = mapBackendStatus(status).monitoring;
  if (base === "monitoring") {
    const hasDraftPending = claimOutcomes.some((o) => o === "draft_pending");
    if (hasDraftPending) return "eligible_drop";
  }
  return base;
}

export function isMonitoringDegraded(status: PurchaseStatus | string | null | undefined): boolean {
  return mapBackendStatus(status).isDegraded;
}

export function getMonitoringStatusBadge(
  status: PurchaseDetailMonitoringStatus,
): PurchaseStatusBadge {
  return BADGE_BY_MONITORING_STATUS[status];
}

/**
 * List-ready status badge for a single purchase row.
 *
 * Unlike the detail page (`deriveMonitoringStatus`), the list does NOT
 * have related-claim context, so an "eligible drop" promotion isn't
 * possible — and per the v0 prompt + locked decision 4, the list MUST
 * be honest about all 8 backend states with a per-status label rather
 * than collapsing to 6 UI states.
 *
 * The list is also intentionally LESS generous than the detail on
 * rogue values: an unknown status surfaces as "Unknown" with neutral
 * styling rather than defaulting to "Monitoring". The detail page is a
 * focused single-purchase context where a calm default reads as the
 * right interpretation; the list is a fleet view where pretending a
 * rogue row is "monitoring" would silently misclassify it.
 *
 * Palette is consistent with the detail header's existing
 * `BADGE_BY_MONITORING_STATUS` so the same visual vocabulary applies
 * across surfaces:
 *  - monitoring / monitoring_degraded / claimed -> blue (in-progress)
 *  - pending_*                -> amber (needs attention / transient)
 *  - refunded                 -> green (positive resolution)
 *  - expired / dismissed      -> neutral (off-state, closed)
 *  - unknown / null           -> neutral with "Unknown" label
 *
 * Palette + sizing are shared with the /claims `ClaimOutcomeBadge`
 * (solid bg-{color}-100 / text-{color}-700 + `BADGE_BASE_CLASSES`) so
 * the two list pages read as one design system (BUG-103). The caller
 * (`StatusCell`) layers `BADGE_BASE_CLASSES` on for the min-width /
 * centered sizing; the degraded amber dot stays a separate signal.
 */
export function getListStatusBadge(
  status: PurchaseStatus | string | null | undefined,
): PurchaseStatusBadge {
  const blue = "bg-blue-100 text-blue-700 border-blue-200";
  const amber = "bg-amber-100 text-amber-700 border-amber-200";
  const green = "bg-green-100 text-green-700 border-green-200";
  const neutral = "bg-neutral-100 text-neutral-600 border-neutral-200";

  switch (status) {
    case "monitoring":
      return { label: "Monitoring", className: blue };
    case "monitoring_degraded":
      // Same blue palette as `monitoring` so a degraded row stays
      // calm; the v0 prompt expects the optional amber dot beside the
      // label as the degraded signal, not a recolored badge.
      return { label: "Monitoring", className: blue };
    case "pending_confirmation":
      return { label: "Pending confirmation", className: amber };
    case "pending_user_edit":
      return { label: "Pending edit", className: amber };
    case "claimed":
      return { label: "Claim active", className: blue };
    case "refunded":
      return { label: "Refund received", className: green };
    case "expired":
      return { label: "Window expired", className: neutral };
    case "dismissed":
      return { label: "Stopped", className: neutral };
    default:
      return { label: "Unknown", className: neutral };
  }
}
