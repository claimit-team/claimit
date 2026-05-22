"use client";

/**
 * /claims/[id] header bar — viewer-only post-real-ification.
 *
 * Write actions render as disabled buttons with "coming soon"
 * tooltips. The pattern mirrors PR1's `purchase-page-header.tsx`
 * `DisabledTooltipButton` (a11y-safe: keyboard-focusable, blocks
 * mouse + Enter/Space, surfaces the tooltip explaining the gap).
 *
 * TODO(claims-detail-write-actions): wire to:
 *   - POST /api/v1/claims/:id/approve   (Approve and send / Send now)
 *   - POST /api/v1/claims/:id/cancel    (Cancel claim / Cancel)
 *   - PUT  /api/v1/claims/:id/edit      (Edit draft / Review)
 *   - No endpoint yet for "Execute" / "Mark as submitted" / "Try a
 *     different angle" / "View receipt" — punt to follow-up.
 */

import { AlertCircle, ArrowLeft, Check, Clock, Edit, Send, XCircle } from "lucide-react";
import Link from "next/link";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ClaimDetailDoc } from "@/lib/api/claims";
import { formatClaimCurrency, formatClaimRemainingTime } from "@/lib/claim-detail";
import type { ClaimDetail, ClaimDetailWorkflowStatus } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

interface ClaimHeaderProps {
  claim: ClaimDetail;
  /**
   * Re-pull server truth. Consumed by WI-6 (approve) / WI-7 (cancel)
   * after a write completes; accepted here so the prop interface is
   * stable across the WI-2 plumbing commit.
   */
  refetch: () => Promise<void>;
  /**
   * Shallow-merge a partial wire claim. Consumed by WI-6/7 to flip
   * the workflow state optimistically before the network round-trip.
   */
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
}

// Tooltip copy per pending endpoint — kept top-level so future
// wiring just deletes the constant + flips the button.
const APPROVE_TODO =
  "Coming soon — will wire to POST /api/v1/claims/:id/approve in a follow-up PR.";
const CANCEL_TODO = "Coming soon — will wire to POST /api/v1/claims/:id/cancel in a follow-up PR.";
const EDIT_TODO = "Coming soon — will wire to PUT /api/v1/claims/:id/edit in a follow-up PR.";
const TRY_AGAIN_TODO =
  "Coming soon — claim redrafting flow needs a backend endpoint before wiring.";
const VIEW_RECEIPT_TODO =
  "Coming soon — the reclaimed-amount receipt link isn't surfaced from the API yet.";

function StatusBadge({ status }: { status: ClaimDetailWorkflowStatus }) {
  const config: Record<ClaimDetailWorkflowStatus, { label: string; className: string }> = {
    awaiting_approval: {
      label: "Awaiting Approval",
      className: "bg-brand-primary-50 text-brand-primary-500 border-brand-primary-500/20",
    },
    queued_for_send: {
      label: "Queued",
      className: "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20",
    },
    ready_to_execute: {
      label: "Ready",
      className: "bg-brand-primary-50 text-brand-primary-500 border-brand-primary-500/20",
    },
    submitted: {
      label: "Submitted",
      className: "bg-neutral-100 text-neutral-700 border-neutral-200",
    },
    approved: {
      label: "Resolved",
      className: "bg-semantic-success/10 text-semantic-success border-semantic-success/20",
    },
    denied: {
      label: "Resolved",
      className: "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
    },
    expired: {
      label: "Window Closed",
      className: "bg-neutral-100 text-neutral-500 border-neutral-200",
    },
  };

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={cn("font-medium", className)}>
      {label}
    </Badge>
  );
}

export function ClaimHeader({
  claim,
  refetch: _refetch,
  applyOptimistic: _applyOptimistic,
}: ClaimHeaderProps) {
  const renderActions = () => {
    // The view-model maps backend `outcome` to UI workflow status per
    // `mapOutcomeToWorkflowStatus`; `queued_for_send` and
    // `ready_to_execute` are UI-only intermediate states never emitted
    // by real data today. Their branches are intentionally absent here
    // (the `default: null` arm covers them) and will return alongside
    // the approve-flow follow-up PR.
    switch (claim.status) {
      case "awaiting_approval":
        return (
          <>
            <DisabledTooltipButton
              label="Edit draft"
              icon={<Edit className="mr-2 h-4 w-4" />}
              tooltip={EDIT_TODO}
              variant="ghost"
            />
            <DisabledTooltipButton
              label="Cancel claim"
              icon={<XCircle className="mr-2 h-4 w-4" />}
              tooltip={CANCEL_TODO}
              variant="ghost"
              danger
            />
            <DisabledTooltipButton
              label="Approve and send"
              icon={<Send className="mr-2 h-4 w-4" />}
              tooltip={APPROVE_TODO}
              variant="default"
            />
          </>
        );

      case "submitted":
        // Submitted to the merchant — no user-driven action until they
        // reply. The MarkResultSection that used to surface here for
        // manual outcome marking has been removed (no backend endpoint
        // yet); see claim-detail-shell.tsx FIXME.
        return null;

      case "approved":
        return (
          <div className="flex items-center gap-2 text-semantic-success">
            <Check className="h-5 w-5" />
            <span className="font-medium">
              Reclaimed{" "}
              {formatClaimCurrency(claim.outcome_amount ?? claim.refund_amount, claim.currency)}
            </span>
            <DisabledTooltipButton
              label="View receipt"
              tooltip={VIEW_RECEIPT_TODO}
              variant="ghost"
            />
          </div>
        );

      case "denied":
        return (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-semantic-danger">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{claim.denial_reason ?? "Claim was denied"}</span>
            </div>
            <DisabledTooltipButton
              label="Try a different angle"
              tooltip={TRY_AGAIN_TODO}
              variant="ghost"
            />
          </div>
        );

      case "expired":
        return null;

      default:
        return null;
    }
  };

  return (
    <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-neutral-200 border-b bg-neutral-0 px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/claims"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back to claims</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/claims" className="text-neutral-500 hover:text-neutral-700">
            Claims
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="font-medium text-neutral-900">{claim.product_name}</span>
        </nav>
      </div>

      <div className="hidden items-center gap-4 md:flex">
        <StatusBadge status={claim.status} />
        <div className="flex items-center gap-2 text-neutral-500 text-sm">
          <span>{claim.platform}</span>
          <span>·</span>
          <span className="font-medium text-neutral-700">
            {formatClaimCurrency(claim.refund_amount, claim.currency)}
          </span>
          {claim.window_remaining_hours > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 text-semantic-warning">
                <Clock className="h-4 w-4" />
                {formatClaimRemainingTime(claim.window_remaining_hours)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">{renderActions()}</div>
    </div>
  );
}

/**
 * Disabled button + tooltip — mirrors PR1's
 * `purchase-page-header.tsx::DisabledTooltipButton`.
 *
 * a11y: a real `disabled` button is not keyboard-focusable, which
 * would hide the explanatory tooltip from keyboard-only users. Render
 * a focusable `aria-disabled` button and block click + Enter/Space
 * activation manually so the control stays inert. The `variant="default"`
 * branch uses the primary button styling; `ghost` / `outline` mirror
 * the per-action visuals from the original mock.
 */
function DisabledTooltipButton({
  label,
  icon,
  tooltip,
  variant,
  danger = false,
}: {
  label: string;
  icon?: ReactNode;
  tooltip: string;
  variant: "default" | "ghost" | "outline";
  danger?: boolean;
}) {
  const blockMouse = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const blockKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-disabled="true"
        tabIndex={0}
        aria-label={`${label} (coming soon)`}
        onClick={blockMouse}
        onKeyDown={blockKeyboard}
        className={cn(
          buttonVariants({ variant, size: "sm" }),
          "cursor-not-allowed opacity-50",
          danger ? "text-semantic-danger" : null,
        )}
      >
        {icon}
        {label}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
