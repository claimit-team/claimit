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

import { AlertCircle, ArrowLeft, Check, Clock, Edit, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatClaimCurrency, formatClaimRemainingTime } from "@/lib/claim-detail";
import type { ClaimDetail, ClaimDetailWorkflowStatus } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

interface ClaimHeaderProps {
  claim: ClaimDetail;
  /** Header → shell: flip the DraftPane tab to `edit`. */
  onClickEdit: () => void;
  /** Header → shell: open the cancel-claim confirm dialog. */
  onClickCancel: () => void;
  /** Header → shell: open the approve-and-send confirm dialog. */
  onClickApprove: () => void;
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
 * Live MM:SS countdown for the queued-for-send claim header branch.
 * Recomputes once a second; floors at 0:00 so a late re-render after
 * the scheduler fires shows "0:00" rather than a negative value.
 *
 * Re-running `setInterval` on every `autoSendAt` change cleanly
 * cancels a stale interval if the user navigates between queued
 * claims (claim-detail page can be reused across IDs).
 */
function useAutoSendCountdown(autoSendAt: string | null | undefined): string {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!autoSendAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [autoSendAt]);
  if (!autoSendAt) return "0:00";
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
}: ClaimHeaderProps) {
  // Hook called unconditionally (rules-of-hooks). When the claim isn't
  // queued the value is unused — `auto_send_at` will be null/absent
  // and the hook returns "0:00" without firing an interval.
  const countdown = useAutoSendCountdown(claim.auto_send_at);

  const renderActions = () => {
    switch (claim.status) {
      case "awaiting_approval":
        return (
          <>
            <Button variant="ghost" size="sm" type="button" onClick={onClickEdit}>
              <Edit className="mr-2 h-4 w-4" />
              Edit draft
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClickCancel}
              className="text-semantic-danger"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel claim
            </Button>
            <Button size="sm" type="button" onClick={onClickApprove}>
              <Send className="mr-2 h-4 w-4" />
              Approve and send
            </Button>
          </>
        );

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
              className="text-semantic-danger"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" type="button" onClick={onClickApprove}>
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
