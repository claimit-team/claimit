"use client";

/**
 * Approve-and-send confirm dialog (5.7 WI-6).
 *
 * Opens when the header's "Approve and send" button is clicked. The
 * dialog summary is type-aware (per claim_type) so the user knows
 * what the action actually does before confirming:
 *
 *   - email          → Sending to {policy.claim_email} for the claim amount
 *   - chat_script    → You'll paste the script in {platform} chat
 *   - in_store       → You'll bring this guide to {platform}
 *   - self_service   → Submitting at {policy.claim_url}
 *
 * On confirm: POST /api/v1/claims/:id/approve with the current edit
 * buffer if dirty (so a mid-edit approve sends the user's latest
 * draft), optimistically flips outcome → "pending", then refetches
 * for server truth. On error: refetch + toast.error so the
 * optimistic patch doesn't linger.
 *
 * The downstream `claim.approved` Pub/Sub topic has no consumer yet
 * (flagged in PR body) — the "Submitted" UI is honest about which
 * step ran. WI-6 surfaces a type-aware banner above the panes
 * post-approve via `PostApproveBanner`.
 */

import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { approveClaim, type ClaimDetailDoc } from "@/lib/api/claims";
import { formatClaimCurrency } from "@/lib/claim-detail";
import type { ClaimDetail, ClaimDetailDraftType } from "@/lib/claim-detail-types";

interface ApproveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: ClaimDetail;
  /** True when the edit buffer diverges from the latest version. */
  dirty: boolean;
  /** Current edit buffer — sent as `edited_draft_content` if `dirty`. */
  editedDraftContent: string;
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
  refetch: () => Promise<void>;
}

function summaryCopy(claim: ClaimDetail): { title: string; description: string } {
  const platform = claim.platform;
  const policy = claim.policy;
  const claimType = claim.claim_type satisfies ClaimDetailDraftType;
  switch (claimType) {
    case "email":
      return {
        title: "Approve and send",
        description:
          policy?.claim_email && policy.claim_email !== ""
            ? `Sending to ${policy.claim_email} for ${formatClaimCurrency(
                claim.refund_amount,
                claim.currency,
              )}.`
            : `Sending the price match request for ${formatClaimCurrency(
                claim.refund_amount,
                claim.currency,
              )}.`,
      };
    case "chat_script":
      return {
        title: "Approve and send",
        description: `You'll paste this script in ${platform} chat. Approving locks it in so the agent can copy step-by-step messages.`,
      };
    case "in_store_guide":
      return {
        title: "Approve and send",
        description: `You'll bring this guide to ${platform}. Approving locks it in so you can show it at the store.`,
      };
    case "self_service_walkthrough":
      return {
        title: "Approve and send",
        description:
          policy?.claim_url && policy.claim_url !== ""
            ? `Submitting at ${policy.claim_url}. Approving locks the walkthrough in so you can step through it.`
            : `Approving locks this self-service walkthrough in so you can step through it.`,
      };
  }
}

export function ApproveConfirmDialog({
  open,
  onOpenChange,
  claim,
  dirty,
  editedDraftContent,
  applyOptimistic,
  refetch,
}: ApproveConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { title, description } = summaryCopy(claim);

  // Block Escape / backdrop / close-button dismissal while the approve
  // is in flight so a user can't accidentally tear down the dialog
  // mid-write and re-trigger the action on reopen (mirrors the
  // cancel-dialog fix; CodeRabbit MAJOR finding, PR #168).
  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const body = dirty ? { edited_draft_content: editedDraftContent } : {};
      await approveClaim(claim.claim_id, body);
      // Approve write succeeded — apply the optimistic patch + close the
      // dialog regardless of whether the follow-up refetch lands. A
      // refetch-only failure does NOT mean the approve failed; reporting
      // it as such would mislead the user into a retry on an already-
      // submitted claim (CodeRabbit MAJOR finding, PR #168).
      const nowIso = new Date().toISOString();
      applyOptimistic({
        outcome: "pending",
        submitted_at: nowIso,
      });
      try {
        await refetch();
      } catch {
        toast.error("Claim approved, but refresh failed. Reload to see latest state.");
      }
      toast.success("Claim approved");
      onOpenChange(false);
    } catch (err: unknown) {
      // Write itself failed — surface the real error and let the user
      // retry. No optimistic patch was applied so there's nothing to
      // reconcile.
      const message = err instanceof Error ? err.message : "Could not approve claim";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {dirty ? (
          <p className="text-neutral-600 text-xs">
            Your unsaved edits will be included in this submission.
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Approve and send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
