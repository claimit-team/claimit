/**
 * ClaimOutcomeBadge — single source of truth for "what does outcome X
 * look like in the UI?" Maps each ClaimOutcome to a label + color classes.
 * Used by the /claims list rows and by the claim detail header so the same
 * outcome always reads the same way.
 *
 * Color scheme (WCAG AA verified):
 * - approved       → green  (bg-green-100 / text-green-700, ~6.5:1)
 * - denied         → red solid (bg-red-700 / text-white, ~5.9:1)
 * - draft_pending / awaiting_approval → amber (bg-amber-100 / text-amber-700, ~4.8:1)
 * - pending / queued_for_send → blue (bg-blue-100 / text-blue-700, ~6.5:1)
 * - expired / no_response / user_* → neutral gray (bg-neutral-100 / text-neutral-600, ~7:1)
 *
 * All badges use `variant="outline"` as the base (adds border, no bg/text) and
 * override bg/text/border via extraClassName. tailwind-merge in `cn()` deduplicates
 * conflicting utilities, so the custom classes win over the variant's defaults.
 */

import type { ClaimOutcome } from "@claimit/mongodb-types";

import { Badge } from "@/components/ui/badge";
import { snakeToTitleLabel } from "@/lib/claims-status";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "destructive" | "ghost";

const OUTCOME_DISPLAY: Record<
  ClaimOutcome,
  { label: string; variant: Variant; extraClassName?: string }
> = {
  draft_pending: {
    label: "Draft pending",
    variant: "outline",
    extraClassName: "bg-amber-100 text-amber-700 border-amber-200",
  },
  awaiting_approval: {
    label: "Awaiting Approval",
    variant: "outline",
    extraClassName: "bg-amber-100 text-amber-700 border-amber-200",
  },
  queued_for_send: {
    label: "Sending Soon",
    variant: "outline",
    extraClassName: "bg-blue-100 text-blue-700 border-blue-200",
  },
  pending: {
    label: "Submitted",
    variant: "outline",
    extraClassName: "bg-blue-100 text-blue-700 border-blue-200",
  },
  approved: {
    label: "Approved",
    variant: "outline",
    extraClassName: "bg-green-100 text-green-700 border-green-200",
  },
  denied: {
    label: "Denied",
    variant: "outline",
    extraClassName: "bg-red-700 text-white border-transparent",
  },
  expired: {
    label: "Expired",
    variant: "outline",
    extraClassName: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
  no_response: {
    label: "No response",
    variant: "outline",
    extraClassName: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
  user_self_service: {
    label: "Self-service",
    variant: "outline",
    extraClassName: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
  user_cancelled: {
    label: "Cancelled",
    variant: "outline",
    extraClassName: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
};

// Applied to every badge so sizing is uniform regardless of outcome.
// Placed after extraClassName in cn() so tailwind-merge gives these
// priority over the CVA variant's px-2 / rounded-4xl defaults.
const BASE_BADGE_CLASSES = "text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap";

/**
 * Resolve the display config for a possibly-unknown outcome string.
 *
 * The backend is now read-tolerant for `outcome` (PR #142), so a legacy
 * doc may surface a value not in `ClaimOutcome`. Rather than crashing
 * with `OUTCOME_DISPLAY[outcome]` returning undefined, fall back to a
 * neutral outline badge with a Title Case label derived from the raw
 * string. `null` / empty renders as an em-dash.
 */
function resolveOutcomeDisplay(outcome: ClaimOutcome | string | null | undefined): {
  label: string;
  variant: Variant;
  extraClassName?: string;
} {
  // `Object.hasOwn` (not `in`) so a rogue/legacy outcome that happens to
  // collide with an `Object.prototype` member name (`"toString"`,
  // `"hasOwnProperty"`, `"constructor"`, …) doesn't accidentally walk the
  // prototype chain and return a broken display config. Read-tolerance
  // means `outcome` is free-form here — never trust the input as a key.
  if (outcome != null && outcome !== "" && Object.hasOwn(OUTCOME_DISPLAY, outcome)) {
    return OUTCOME_DISPLAY[outcome as ClaimOutcome];
  }
  return {
    label: snakeToTitleLabel(outcome),
    variant: "outline",
  };
}

export function ClaimOutcomeBadge({
  outcome,
  className,
}: {
  outcome: ClaimOutcome | string | null | undefined;
  className?: string;
}) {
  const { label, variant, extraClassName } = resolveOutcomeDisplay(outcome);
  return (
    <Badge variant={variant} className={cn(extraClassName, BASE_BADGE_CLASSES, className)}>
      {label}
    </Badge>
  );
}

export function getClaimOutcomeLabel(outcome: ClaimOutcome | string | null | undefined): string {
  return resolveOutcomeDisplay(outcome).label;
}
