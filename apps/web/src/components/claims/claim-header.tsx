"use client";

import { AlertCircle, ArrowLeft, Check, Clock, Edit, Play, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatClaimCurrency, formatClaimRemainingTime } from "@/lib/claim-detail";
import type {
  ClaimDetail,
  ClaimDetailDraftType,
  ClaimDetailWorkflowStatus,
} from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

interface ClaimHeaderProps {
  claim: ClaimDetail;
  onApproveAndSend?: () => void;
  onCancelClaim?: () => void;
  onEditDraft?: () => void;
  onSendNow?: () => void;
  onMarkSubmitted?: () => void;
  onExecute?: () => void;
}

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

function CountdownTimer({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <span className="font-mono text-semantic-warning">
      Sending in {minutes}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

function executeLabel(claimType: ClaimDetailDraftType): string {
  switch (claimType) {
    case "in_store_guide":
      return "View guide";
    case "self_service_walkthrough":
      return "Start walkthrough";
    default:
      return "Execute";
  }
}

export function ClaimHeader({
  claim,
  onApproveAndSend,
  onCancelClaim,
  onEditDraft,
  onSendNow,
  onMarkSubmitted,
  onExecute,
}: ClaimHeaderProps) {
  const renderActions = () => {
    switch (claim.status) {
      case "awaiting_approval":
        return (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onEditDraft}>
              <Edit className="mr-2 h-4 w-4" />
              Edit draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelClaim}
              className="text-semantic-danger hover:bg-semantic-danger/10 hover:text-semantic-danger"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel claim
            </Button>
            <Button type="button" size="sm" onClick={onApproveAndSend}>
              <Send className="mr-2 h-4 w-4" />
              Approve and send
            </Button>
          </>
        );

      case "queued_for_send":
        return (
          <>
            <CountdownTimer initialSeconds={272} />
            <Button type="button" variant="ghost" size="sm" onClick={onEditDraft}>
              Review
            </Button>
            <Button type="button" size="sm" onClick={onSendNow}>
              Send now
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelClaim}
              className="text-semantic-danger hover:bg-semantic-danger/10 hover:text-semantic-danger"
            >
              Cancel
            </Button>
          </>
        );

      case "ready_to_execute":
        return (
          <>
            <Button type="button" size="sm" onClick={onExecute}>
              <Play className="mr-2 h-4 w-4" />
              {executeLabel(claim.claim_type)}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onMarkSubmitted}>
              <Check className="mr-2 h-4 w-4" />
              Mark as submitted
            </Button>
          </>
        );

      case "submitted":
        return null;

      case "approved":
        return (
          <div className="flex items-center gap-2 text-semantic-success">
            <Check className="h-5 w-5" />
            <span className="font-medium">
              Reclaimed{" "}
              {formatClaimCurrency(claim.outcome_amount ?? claim.refund_amount, claim.currency)}
            </span>
            <Button type="button" variant="ghost" size="sm" className="ml-2">
              View receipt
            </Button>
          </div>
        );

      case "denied":
        return (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-semantic-danger">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{claim.denial_reason ?? "Claim was denied"}</span>
            </div>
            <Button type="button" variant="ghost" size="sm">
              Try a different angle
            </Button>
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
