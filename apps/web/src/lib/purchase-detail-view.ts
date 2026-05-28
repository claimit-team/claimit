/**
 * Purchase-detail view-model layer.
 *
 * Owns:
 *  - The render-friendly types (`PurchaseDetailViewModel` and friends)
 *    the /purchases/:id components consume.
 *  - Formatters (`formatPurchaseCurrency`, `formatPurchaseDate`, ...)
 *    that the chart, header, and cards share.
 *  - `buildPurchaseDetailViewModel(response)` which maps the wire
 *    `PurchaseDetailResponse` into the render-friendly shape.
 *
 * The types LIVED in `lib/mock-purchases.ts` until ticket 5.6. They
 * were moved out so real (api-driven) components don't import their
 * shared type contracts from a mock file. `lib/mock-purchases.ts`
 * itself was deleted in ticket 5.14 B10 once the confirm flow real-
 * ified.
 *
 * Read-tolerance: the builder treats every enum-typed and required-
 * scalar wire field as nullable (PR #142/#144) and falls back to safe
 * defaults rather than throwing. A single rogue/legacy row in the wire
 * response cannot crash the page.
 */

import type { ClaimOutcome, ClaimType } from "@claimit/mongodb-types";

import type {
  PriceHistoryDoc,
  PurchaseClaim,
  PurchaseDetailDoc,
  PurchaseDetailResponse,
} from "@/lib/api/purchases";
import { getPlatformLabel } from "@/lib/platform-labels";
import { deriveMonitoringStatus, isMonitoringDegraded } from "@/lib/purchase-status";

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

/**
 * UI-derived category for layout decisions (e.g. fallback icon in
 * `PlatformLogo`, the "Category" row in original-purchase-details).
 * Matches the backend `Category` enum but accepts unknown strings so
 * a read-tolerant rogue value lands in the "retail" fallback path
 * (the most generic icon) without crashing.
 */
export type PurchaseCategory = "retail" | "airline" | "hotel";

/**
 * UI-derived monitoring status — collapses the 8-value backend
 * `PurchaseStatus` plus the related-claim hint into the 6 visual
 * states the v0-prompt header surfaces. See `purchase-status.ts` for
 * the mapping.
 */
export type PurchaseDetailMonitoringStatus =
  | "monitoring"
  | "eligible_drop"
  | "claim_active"
  | "claim_resolved"
  | "window_expired"
  | "stopped";

/**
 * One point in the chart-friendly price series. The `dropDetected`
 * flag is set ONLY on the first below-paid point in the series — the
 * "drop event". Subsequent below-paid points stay amber-styled (by
 * matching the per-point `price < pricePaid` predicate at render time)
 * but DO NOT carry the "Drop detected" tooltip label (decision 6 in
 * the review).
 */
export interface PriceHistoryPointVm {
  date: string;
  price: number;
  dropDetected: boolean;
}

export type PurchaseDetailOriginalSource = "upload" | "email" | "api";

/** The brief shown in the "Claims on this purchase" card. */
export interface RelatedClaimBrief {
  claimId: string;
  outcome: ClaimOutcome | string | null;
  claimType: ClaimType | string | null;
  amount: number | null;
  currency: string | null;
  createdAt: string | null;
}

export interface PurchaseDetailViewModel {
  purchaseId: string;
  platform: string;
  category: PurchaseCategory;
  /** Raw backend platform string — passed to `PlatformLogo` for the
   * brand asset lookup; `platform` (above) is the display label. */
  platformRaw: string | null;
  /** Raw backend category — `PlatformLogo` uses it to pick the fallback
   * icon when the brand SVG isn't found. */
  categoryRaw: string | null;
  title: string;
  monitoringStatus: PurchaseDetailMonitoringStatus;
  monitoringDegraded: boolean;
  /** `null` when BOTH `purchase_date` and `ingested_at` are missing on
   * the wire doc. Consumers MUST short-circuit to a placeholder ("—")
   * and NEVER fabricate a substitute date — fabricating "today" skews
   * the refund-window math downstream. */
  purchaseDate: string | null;
  orderId: string;
  pricePaid: number;
  currency: string;
  /** Price series ordered ASC by checked_at, pre-mapped to the
   * matching-tier price. May be empty for a freshly-monitored
   * purchase. */
  priceHistory: PriceHistoryPointVm[];
  currentPrice: number | null;
  lowestSeen: number | null;
  highestSeen: number | null;
  lastCheckedIso: string | null;
  /** `null` when `window_expires` is missing. */
  windowEndDate: string | null;
  /** `null` when `window_expires` is missing — short-circuit the
   * progress bar / "X days remaining" copy to "—". */
  daysRemaining: number | null;
  policySummary: string;
  relatedClaims: RelatedClaimBrief[];
  /** The primary related claim's id — surfaced as the header CTA target
   * (`View claim` / `View draft claim`). Picks the draft_pending claim
   * if one exists, else the most recently updated. */
  primaryRelatedClaimId: string | null;
  memberTier: string | null;
  memberPriceAtPurchase: number | null;
  nonMemberPriceAtPurchase: number | null;
  sourceEmail: string | null;
  purchaseSource: PurchaseDetailOriginalSource;
  /**
   * BUG-19: monitor-failure trail surfaced from the wire `purchase` doc.
   * The price-history card renders a real explanation + remediation
   * action when `monitorErrorCode` is set, instead of the hopeful
   * "waiting for snapshot" empty state. `null` everywhere means the
   * monitor is healthy (or has never run yet).
   */
  productUrl: string | null;
  monitorError: string | null;
  monitorErrorAt: string | null;
  monitorErrorCode: string | null;
}

// ---------------------------------------------------------------------------
// Formatters — shared between the chart, header, and detail cards.
// ---------------------------------------------------------------------------

export function formatPurchaseCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Read-tolerant date placeholder. Surfaced wherever a wire field is
 * `null` / `""` / a malformed ISO string. Matches the master design
 * doc's "—" convention for missing scalars.
 */
const DATE_PLACEHOLDER = "—";

/**
 * Parse `dateString` and return a valid `Date`, or `null` if the input
 * is empty / null / produces NaN. The helpers below all funnel through
 * this so a single rogue wire value can never render
 * "Invalid Date" / "NaN days ago" in the UI.
 */
function parseValidDate(dateString: string | null | undefined): Date | null {
  if (dateString === null || dateString === undefined || dateString === "") return null;
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPurchaseDate(dateString: string | null | undefined): string {
  const date = parseValidDate(dateString);
  if (date === null) return DATE_PLACEHOLDER;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPurchaseShortDate(dateString: string | null | undefined): string {
  const date = parseValidDate(dateString);
  if (date === null) return DATE_PLACEHOLDER;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function getPurchaseRelativeTime(dateString: string | null | undefined): string {
  const date = parseValidDate(dateString);
  if (date === null) return DATE_PLACEHOLDER;
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

// ---------------------------------------------------------------------------
// View-model builder
// ---------------------------------------------------------------------------

const CATEGORY_VALUES: ReadonlySet<PurchaseCategory> = new Set(["retail", "airline", "hotel"]);

function safeCategory(raw: string | null): PurchaseCategory {
  if (raw !== null && (CATEGORY_VALUES as ReadonlySet<string>).has(raw)) {
    return raw as PurchaseCategory;
  }
  // Legacy/null/unknown -> safest catch-all for layout purposes. The
  // visible label uses the snake-case raw string elsewhere (so "—" or
  // the legacy value still surfaces in the UI); this is only for
  // PlatformLogo's icon fallback choice.
  return "retail";
}

export function safePlatformLabel(raw: string | null): string {
  return getPlatformLabel(raw);
}

/**
 * Map a `PriceHistoryDoc` to its matching-tier price + checked_at.
 *
 * Per the master doc §5.4 / the locked decision (#7 in the PR plan):
 * a purchase with `member_tier_at_purchase` set is monitored on the
 * `price_member` line; everything else is monitored on
 * `price_non_member`. The chart plots a SINGLE line per the decision
 * (no dual member/non-member lines).
 *
 * Returns null if neither field is populated, OR if `checked_at` is
 * null — those rows are dropped from the chart series (no x-axis
 * position) but kept in the wire response for traceability.
 */
function pickMatchingTierPrice(
  row: PriceHistoryDoc,
  purchase: PurchaseDetailDoc,
): { date: string; price: number } | null {
  if (row.checked_at === null) return null;
  // Treat null, empty string, and whitespace-only strings as "no tier"
  // — a legacy purchase with `member_tier_at_purchase=""` must fall
  // back to `price_non_member` rather than reading the (always-null)
  // `price_member` field and getting dropped from the chart entirely.
  const hasTier = (purchase.member_tier_at_purchase ?? "").trim() !== "";
  const price = hasTier ? row.price_member : row.price_non_member;
  if (price === null) return null;
  return { date: row.checked_at, price };
}

function pickPrimaryRelatedClaim(claims: PurchaseClaim[]): PurchaseClaim | null {
  if (claims.length === 0) return null;
  const draft = claims.find((c) => c.outcome === "draft_pending");
  // backend already sorts updated_at DESC; index 0 is the most recent.
  return draft ?? claims[0];
}

function toRelatedClaimBrief(claim: PurchaseClaim): RelatedClaimBrief {
  return {
    claimId: claim._id,
    outcome: claim.outcome,
    claimType: claim.claim_type,
    amount: claim.claim_amount,
    currency: claim.currency,
    createdAt: claim.submitted_at ?? claim.updated_at ?? null,
  };
}

/**
 * Compute "days remaining" until `window_expires`. Clamped at 0 so the
 * UI never shows a negative count (the header status surfaces "Window
 * expired" separately for that case). Returns `null` when the wire
 * value is missing / malformed — the refund-eligibility card MUST
 * short-circuit to a placeholder rather than render "0 days remaining"
 * (which would mis-signal an expired window).
 */
function daysUntil(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const diffDays = Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
}

/**
 * Build the chart-friendly price series.
 *
 * Drop-label rule (decision 6 in the review): `dropDetected = true`
 * only on the FIRST below-paid point — that's the drop EVENT. Other
 * below-paid points are rendered amber by matching the
 * `price < pricePaid` predicate at render time but stay UNLABELED so
 * the chart reads as a single drop story rather than a noisy series
 * of warnings.
 */
function buildPriceSeries(
  rows: PriceHistoryDoc[],
  purchase: PurchaseDetailDoc,
  pricePaid: number,
): PriceHistoryPointVm[] {
  const series: PriceHistoryPointVm[] = [];
  let dropFlagged = false;
  for (const row of rows) {
    const point = pickMatchingTierPrice(row, purchase);
    if (point === null) continue;
    const isBelowPaid = point.price < pricePaid;
    const dropDetected = isBelowPaid && !dropFlagged;
    if (dropDetected) dropFlagged = true;
    series.push({ date: point.date, price: point.price, dropDetected });
  }
  return series;
}

function inferOriginalSource(ingestionSource: string | null): PurchaseDetailOriginalSource {
  switch (ingestionSource) {
    case "gmail":
      return "email";
    case "upload_pdf":
    case "upload_image":
      return "upload";
    default:
      // Unknown ingestion source / null -> safest catch-all.
      return "upload";
  }
}

/**
 * Map the enriched wire response into a render-friendly view-model.
 *
 * Null-safe everywhere. Empty `priceHistory` is preserved as `[]` (the
 * chart renders a calm empty state per decision 5). Heavy-string
 * fields (product_name, order_id, ...) default to "—" so a legacy
 * doc with a null field renders as a dash rather than crashing.
 */
export function buildPurchaseDetailViewModel(
  response: PurchaseDetailResponse,
): PurchaseDetailViewModel {
  const { purchase, price_history, claims } = response;

  const pricePaid = purchase.price_paid ?? 0;
  const series = buildPriceSeries(price_history, purchase, pricePaid);

  // Mini-stat values are derived from the PLOTTED series (matching-tier
  // prices only). A purchase with zero plottable snapshots surfaces
  // null mini-stats — the chart's empty state replaces the figures
  // with "—" so the layout doesn't show fake numbers.
  const plottedPrices = series.map((p) => p.price);
  const currentPrice = plottedPrices.length > 0 ? plottedPrices[plottedPrices.length - 1] : null;
  const lowestSeen = plottedPrices.length > 0 ? Math.min(...plottedPrices) : null;
  const highestSeen = plottedPrices.length > 0 ? Math.max(...plottedPrices) : null;

  const primary = pickPrimaryRelatedClaim(claims);

  const claimOutcomes = claims.map((c) => c.outcome);
  const monitoringStatus = deriveMonitoringStatus(purchase.status, claimOutcomes);

  return {
    purchaseId: purchase._id,
    platform: safePlatformLabel(purchase.platform),
    category: safeCategory(purchase.category),
    platformRaw: purchase.platform,
    categoryRaw: purchase.category,
    title: purchase.product_name ?? "—",
    monitoringStatus,
    // Use the helper so a rogue/legacy status string (read-tolerant)
    // still resolves to the right boolean — the inline equality check
    // we used to do here would silently miss any future degraded
    // sub-variant (e.g. `monitoring_degraded_rate_limited`).
    monitoringDegraded: isMonitoringDegraded(purchase.status),
    // CRITICAL: do NOT fall back to `new Date().toISOString()` — that
    // makes a legacy purchase with no `purchase_date` AND no
    // `ingested_at` look like it was bought today, which would skew
    // the refund-window math in `RefundEligibilityCard`. Surface
    // `null` and let the consumer short-circuit to a placeholder.
    purchaseDate: purchase.purchase_date ?? purchase.ingested_at ?? null,
    orderId: purchase.order_id ?? "—",
    pricePaid,
    currency: purchase.currency ?? "USD",
    priceHistory: series,
    currentPrice,
    lowestSeen,
    highestSeen,
    // checked_at is the freshness signal the chart footer surfaces;
    // last_checked_at is the cron-sweep stamp (independent of whether
    // any actual snapshot was written). Prefer the snapshot's own
    // checked_at when available.
    lastCheckedIso:
      price_history.length > 0
        ? (price_history[price_history.length - 1].checked_at ?? purchase.last_checked_at)
        : purchase.last_checked_at,
    windowEndDate: purchase.window_expires ?? null,
    daysRemaining: daysUntil(purchase.window_expires),
    // Policy summary comes from the Policy collection (claim-detail uses
    // it). The detail page surfaces a short inline summary; if the
    // backend ever returns the policy join here, plug it in. Today it's
    // a generic placeholder so the card still renders.
    policySummary: "Price-match policies vary by retailer. ClaimIt monitors the eligible window.",
    relatedClaims: claims.map(toRelatedClaimBrief),
    primaryRelatedClaimId: primary?._id ?? null,
    memberTier: purchase.member_tier_at_purchase,
    memberPriceAtPurchase: purchase.member_price_at_purchase,
    nonMemberPriceAtPurchase: purchase.non_member_price_at_purchase,
    sourceEmail: purchase.sender,
    purchaseSource: inferOriginalSource(purchase.ingestion_source),
    productUrl: purchase.product_url ?? null,
    // `?? null` guards against a backend that doesn't yet expose the
    // BUG-19 fields (older deployments, or the read-tolerant variant
    // before it learned about them): wire `undefined` would otherwise
    // tunnel through and flip the chart into its error empty-state on
    // every healthy purchase. View-model contract is `string | null`.
    monitorError: purchase.last_monitor_error ?? null,
    monitorErrorAt: purchase.last_monitor_error_at ?? null,
    monitorErrorCode: purchase.last_monitor_error_code ?? null,
  };
}
