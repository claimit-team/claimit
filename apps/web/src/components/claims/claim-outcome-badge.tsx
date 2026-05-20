/**
 * ClaimOutcomeBadge — single source of truth for "what does outcome X
 * look like in the UI?" Maps each ClaimOutcome to a label + Shadcn
 * Badge variant. Used by the /claims list rows and by the claim detail
 * header so the same outcome always reads the same way.
 *
 * Variant choices:
 * - approved -> default (green primary) so resolved-favorable jumps out
 * - denied -> destructive (the only outcome that's an explicit "no")
 * - pending (submitted, awaiting outcome) -> secondary, in-progress feel
 * - draft_pending -> outline with amber tint (action-needed, not error)
 * - everything else (expired, no_response, user_*) -> outline / ghost
 *   (resolved but neutral/closed, not a celebration)
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
    // Amber-tinted outline so "needs your approval" reads as action-needed
    // without feeling like a destructive error.
    extraClassName: "border-amber-500 text-amber-700",
  },
  pending: {
    label: "Submitted",
    variant: "secondary",
  },
  approved: {
    label: "Approved",
    variant: "default",
  },
  denied: {
    label: "Denied",
    variant: "destructive",
  },
  expired: {
    label: "Expired",
    variant: "outline",
  },
  user_self_service: {
    label: "Self-service",
    variant: "outline",
  },
  user_cancelled: {
    label: "Cancelled",
    variant: "outline",
  },
  no_response: {
    label: "No response",
    variant: "outline",
  },
};

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
    <Badge variant={variant} className={cn(extraClassName, className)}>
      {label}
    </Badge>
  );
}

export function getClaimOutcomeLabel(outcome: ClaimOutcome | string | null | undefined): string {
  return resolveOutcomeDisplay(outcome).label;
}
