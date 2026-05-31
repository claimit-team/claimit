/**
 * Display metadata for NotificationEventType values.
 *
 * The backend NotificationEventType taxonomy is the source of truth
 * (see packages/shared/mongodb/claimit_mongodb_models/enums.py and the
 * mirrored TS union in NotificationEvent.ts). This module attaches a
 * lightweight presentation layer:
 *
 *   - EVENT_LABELS:  short human-readable noun phrase for tabs / filters /
 *     row titles. No verbs, no period — those are added by the consumer.
 *   - EVENT_ICONS:   Lucide icon component (typed as
 *     `LucideIcon`) chosen to match the semantic class of the event.
 *
 * Picking icons:
 *   - claim_* events use FileText (the same icon the rest of the app
 *     uses for claim documents in cards and lists).
 *   - price_dropped uses TrendingDown — a downward trend reads as
 *     "savings" rather than "alarm".
 *   - low_confidence_extract uses TriangleAlert — needs user attention.
 *   - first_time_dashboard / user_returned events use Sparkles — a
 *     friendly, low-stakes greeting.
 *   - consecutive_rejections uses ShieldAlert — a system-level pattern
 *     warning.
 *
 * Lives under lib/notifications/ to mirror lib/api/notifications.ts —
 * both files describe the same domain at a non-component layer.
 */

import type { NotificationEventType } from "@claimit/mongodb-types";
import {
  CheckCircle2,
  FileText,
  Link2,
  type LucideIcon,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";

export const EVENT_LABELS: Record<NotificationEventType, string> = {
  price_dropped: "Price drop",
  claim_drafted: "Claim drafted",
  claim_queued_auto: "Claim queued",
  claim_submitted: "Claim submitted",
  claim_denied: "Claim denied",
  claim_resolved_success: "Claim resolved",
  low_confidence_extract: "Needs review",
  first_time_dashboard: "Welcome",
  user_returned_after_long_absence: "Welcome back",
  consecutive_rejections: "Pattern alert",
  product_url_resolved: "Product link found",
  product_url_corrected: "Product link corrected",
  product_url_unresolved: "Product link needed",
};

export const EVENT_ICONS: Record<NotificationEventType, LucideIcon> = {
  price_dropped: TrendingDown,
  claim_drafted: FileText,
  claim_queued_auto: FileText,
  claim_submitted: FileText,
  claim_denied: TriangleAlert,
  claim_resolved_success: CheckCircle2,
  low_confidence_extract: TriangleAlert,
  first_time_dashboard: Sparkles,
  user_returned_after_long_absence: Sparkles,
  consecutive_rejections: ShieldAlert,
  product_url_resolved: Link2,
  product_url_corrected: Link2,
  product_url_unresolved: TriangleAlert,
};

/**
 * The list of types exposed in the /notifications event_type dropdown,
 * in the order they should appear. Frontend-only ordering — does not
 * imply precedence in the backend taxonomy.
 */
export const FILTERABLE_EVENT_TYPES: readonly NotificationEventType[] = [
  "claim_drafted",
  "claim_queued_auto",
  "claim_submitted",
  "claim_denied",
  "claim_resolved_success",
  "price_dropped",
  "low_confidence_extract",
  "product_url_resolved",
  "product_url_corrected",
  "product_url_unresolved",
  "consecutive_rejections",
  "first_time_dashboard",
  "user_returned_after_long_absence",
];
