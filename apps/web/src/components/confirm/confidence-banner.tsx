"use client";

import { AlertTriangle, FileQuestion } from "lucide-react";

/**
 * Confidence banner (ticket 5.14 B5 — real extraction surface).
 *
 * The B3 commit moved confidence derivation onto `ConfirmPurchaseContent`
 * which now passes us the precomputed `lowConfidenceFields` (form-field
 * names, post-mapping) + `isMostlyFailed` flag. This component is
 * presentational: three states, no per-field icons or border colors
 * (v0 critical — labels stay visually uniform).
 *
 * Field-name mapping from confidence keys → form field labels is
 * handled here so the banner shows e.g. "Purchase price" instead of
 * "price_paid" / "price". Mapping rules:
 *   - `price` and `price_paid` both collapse to "Purchase price"
 *     (the form has a single Purchase price input); duplicates are
 *     deduped after the rewrite.
 *   - `product_name` → "Product name", `order_id` → "Order ID",
 *     `purchase_date` → "Purchase date", `platform` → "Platform",
 *     `category` → "Category", `member_tier_at_purchase` →
 *     "Member tier".
 *   - any other key falls back to a Title-Cased snake_case (so a
 *     future confidence key surfaces a readable name without a code
 *     change here).
 */

const FIELD_LABEL: Record<string, string> = {
  price: "Purchase price",
  price_paid: "Purchase price",
  product_name: "Product name",
  product_id: "Product",
  order_id: "Order ID",
  purchase_date: "Purchase date",
  platform: "Platform",
  category: "Category",
  member_tier_at_purchase: "Member tier",
  variant: "Variant",
  member_price_at_purchase: "Member price",
};

function snakeToTitle(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function labelForField(field: string): string {
  return FIELD_LABEL[field] ?? snakeToTitle(field);
}

interface ConfidenceBannerProps {
  /**
   * Aggregate extraction confidence (`extraction_confidence.overall_min`
   * on the wire). Used to short-circuit the "all-high → no banner"
   * branch without re-walking the field list.
   */
  overallConfidence: number;
  /**
   * Backend confidence-key names the parent flagged as
   * low-confidence (already filtered to exclude `overall_min` /
   * `price` aggregates and any null/N/A score). We display labels
   * derived from these via `labelForField`.
   */
  lowConfidenceFields: ReadonlyArray<string>;
  /**
   * Parent decided this row is "mostly failed" — switches the banner
   * to the neutral fill-in-manually surface even when only a couple
   * of fields are technically below threshold.
   */
  isMostlyFailed?: boolean;
}

export function ConfidenceBanner({
  overallConfidence,
  lowConfidenceFields,
  isMostlyFailed = false,
}: ConfidenceBannerProps) {
  // State 1 — all-high. No banner so the form reads as a clean
  // accept-this surface; the parent rendered the same form either
  // way (uniform labels, no field-level coloring).
  if (overallConfidence >= 0.95 && lowConfidenceFields.length === 0 && !isMostlyFailed) {
    return null;
  }

  // State 3 — mostly failed. Neutral copy: "fill in manually"
  // sets expectations rather than naming the long list of fields.
  if (isMostlyFailed) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-neutral-50 p-4">
        <FileQuestion className="mt-0.5 size-5 shrink-0 text-neutral-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-neutral-700">Couldn&apos;t extract most details</p>
          <p className="mt-0.5 text-sm text-neutral-500">
            Please fill in the information manually.
          </p>
        </div>
      </div>
    );
  }

  // State 2 — some-low. Amber surface that names the specific fields
  // the user should double-check. Dedupe labels because `price` and
  // `price_paid` can both be low and both map to "Purchase price".
  if (lowConfidenceFields.length > 0) {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const key of lowConfidenceFields) {
      const label = labelForField(key);
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
    const joined = labels.join(", ");

    return (
      <div className="flex items-start gap-3 rounded-lg bg-semantic-warning-bg p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-semantic-warning" aria-hidden />
        <div>
          <p className="text-sm font-medium text-neutral-700">
            We weren&apos;t sure about a couple of fields
          </p>
          <p className="mt-0.5 text-sm text-neutral-500">
            Please double-check <span className="font-medium">{joined}</span> before confirming.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
