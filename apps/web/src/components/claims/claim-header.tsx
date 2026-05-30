"use client";

/**
 * /claims/[id] header bar — write actions wired in 5.7.
 *
 * The header itself is stateless: clicking an action emits an
 * `onClickX` callback to `ClaimDetailShell`, which owns the dialog
 * open state + edit buffer + approve/cancel flow. This keeps the
 * header lean and lets the shell pass `dirty` + `editBuffer` into
 * the approve dialog so a mid-edit approve includes the unsaved
 * draft as `edited_draft_content`.
 *
 * Actions per status (mapped via mapOutcomeToWorkflowStatus):
 *   - awaiting_approval → Edit draft / Cancel claim / Approve and send
 *   - submitted         → (none — see PostApproveBanner)
 *   - approved          → Reclaimed $X (view receipt deferred)
 *   - denied            → denial reason + Try a different angle (deferred)
 *   - cancelled         → muted cancel reason subtext
 *   - expired           → none
 */

import { AlertCircle, ArrowLeft, Check, Clock, Edit, Printer, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useState } from "react";

import { getApproveAction } from "@/components/claims/approve-confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatClaimCurrency, formatClaimRemainingTime } from "@/lib/claim-detail";
import type { ClaimDetail, ClaimDetailWorkflowStatus } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";

interface ClaimHeaderProps {
  claim: ClaimDetail;
  /** Header → shell: flip the DraftPane tab to `edit`. */
  onClickEdit: () => void;
  /** Header → shell: open the cancel-claim confirm dialog. */
  onClickCancel: () => void;
  /** Header → shell: open the approve-and-send confirm dialog. */
  onClickApprove: () => void;
  /**
   * Header → shell: trigger browser print-to-PDF for an in-store
   * guide (ticket 5.16). Only invoked from the "Download PDF" button,
   * which is rendered only when `claim.claim_type === "in_store_guide"`.
   * Shell toggles `body.printing-in-store-guide` + calls `window.print()`.
   */
  onClickPrint: () => void;
}

// Tooltip copy for the two actions still missing backends today.
// (Approve / Cancel / Edit are wired in 5.7 and no longer need a
// "coming soon" tooltip.) These two flip when the matching backends
// land: View receipt → reclaimed-amount receipt URL on Claim; Try a
// different angle → redraft endpoint (not yet specced).
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
    cancelled: {
      label: "Cancelled",
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

/**
 * Live MM:SS countdown helpers for the queued-for-send claim header
 * branch. Mirrors the dashboard `auto-send-banner` pair: a single
 * always-on second ticker drives `now`, and a pure formatter floors
 * the remaining time at "0:00" so a late re-render after the
 * scheduler fires never shows a negative value.
 */
function useCurrentSecond(): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatCountdown(autoSendAt: string, now: number): string {
  const target = new Date(autoSendAt).getTime();
  if (Number.isNaN(target)) return "0:00";
  const remainingMs = Math.max(0, target - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ClaimHeader({
  claim,
  onClickEdit,
  onClickCancel,
  onClickApprove,
  onClickPrint,
}: ClaimHeaderProps) {
  // Hook called unconditionally (rules-of-hooks). The interval is
  // always on; `countdown` is only read on the queued_for_send branch.
  const now = useCurrentSecond();
  const countdown = claim.auto_send_at ? formatCountdown(claim.auto_send_at, now) : "0:00";
  const gmailConnected = useAuthStore((s) => s.user?.gmail_integration?.connected ?? false);

  const renderActions = () => {
    switch (claim.status) {
      case "awaiting_approval": {
        const approveAction = getApproveAction(claim.claim_type, gmailConnected);
        const ApproveIcon = approveAction.icon;
        return (
          <>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClickEdit}
              className="w-full sm:w-auto"
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit draft
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClickCancel}
              className="w-full text-semantic-danger sm:w-auto"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel claim
            </Button>
            <Button size="sm" type="button" onClick={onClickApprove} className="w-full sm:w-auto">
              <ApproveIcon className="mr-2 h-4 w-4" />
              {approveAction.headerLabel}
            </Button>
          </>
        );
      }

      case "queued_for_send":
        // 5.15 / WI-8: the auto-send queue surface on the claim page
        // itself — countdown drives urgency; Send now / Cancel reuse
        // the same approve / cancel dialogs as the awaiting_approval
        // branch so the gateway path is identical (Send-now from the
        // banner OR the header both hit POST /approve, which accepts
        // queued_for_send per WI-6).
        return (
          <>
            <span className="flex items-center gap-1 text-neutral-700 text-sm tabular-nums">
              <Clock className="h-4 w-4 text-semantic-warning" />
              Sending in {countdown}
            </span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClickCancel}
              className="w-full text-semantic-danger sm:w-auto"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" type="button" onClick={onClickApprove} className="w-full sm:w-auto">
              <Send className="mr-2 h-4 w-4" />
              Send now
            </Button>
          </>
        );

      case "submitted":
        // Submitted to the merchant — outcome reporting lives in
        // ClaimOutcomePrompt below PostApproveBanner in the shell.
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

      case "cancelled":
        // Closed by user action — surface the cancel reason inline so
        // the user remembers why this claim is sitting on the list as
        // "Cancelled" rather than "Window Closed". Truncated with
        // `max-w-[16rem]` + hover-tooltip so a long free-text reason
        // doesn't push the breadcrumb / actions off-screen on
        // narrower layouts (CodeRabbit MINOR, PR #168).
        return claim.cancel_reason !== undefined && claim.cancel_reason !== "" ? (
          <span
            className="max-w-[16rem] truncate text-neutral-500 text-sm italic"
            title={`Cancelled: ${claim.cancel_reason}`}
          >
            Cancelled: {claim.cancel_reason}
          </span>
        ) : null;

      default:
        return null;
    }
  };

  return (
    // `data-print-hide`: the in-page sticky chrome (back arrow,
    // breadcrumb, status badge, action buttons including "Download PDF"
    // itself) is collapsed in 5.16 print mode — see globals.css
    // `@media print { body.printing-in-store-guide ... }`.
    <div
      data-print-hide
      className="sticky top-0 z-10 border-neutral-200 border-b bg-neutral-0 px-4 py-3 lg:px-6"
    >
      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/claims"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8 shrink-0")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to claims</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-2 text-sm">
            <Link href="/claims" className="shrink-0 text-neutral-500 hover:text-neutral-700">
              Claims
            </Link>
            <span className="shrink-0 text-neutral-300">/</span>
            <span className="truncate font-medium text-neutral-900">{claim.product_name}</span>
          </nav>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusBadge status={claim.status} />
            <div className="flex flex-wrap items-center gap-2 text-neutral-500 text-sm">
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

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {/*
             * "Download PDF" — ticket 5.16. Rendered OUTSIDE the status
             * switch so it's available on any in-store guide regardless
             * of workflow state (a `submitted` or `approved` in-store
             * claim is still useful to re-print before walking into the
             * store). Gated on the UI claim_type value `"in_store_guide"`
             * (the view-model transform in `claim-detail-view.ts` maps
             * the wire `"in_store"` → this string — see
             * `mapClaimTypeToUi` at L363).
             */}
            {claim.claim_type === "in_store_guide" ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={onClickPrint}
                className="w-full sm:w-auto"
              >
                <Printer className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            ) : null}
            {renderActions()}
          </div>
        </div>
      </div>
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
