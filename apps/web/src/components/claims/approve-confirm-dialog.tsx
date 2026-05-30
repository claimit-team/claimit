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
 *   - self_service   → You'll complete this at {platform}
 *
 * Description copy is policy-URL-free for self-service: prod
 * verification surfaced a raw policy.claim_url (e.g. a long
 * Best Buy support URL) breaking out of the dialog frame and
 * pushing the footer buttons offscreen. The walkthrough JSON
 * already carries its own clickable claim_url (rendered by
 * SelfServiceWalkthrough + PostApproveBanner) so the dialog
 * doesn't need to repeat the raw URL — platform name suffices.
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

import { Check, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { isValidSelfServiceJson } from "@/components/claims/draft-parsers";
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
import type { ClaimDetail, ClaimDetailDraftType } from "@/lib/claim-detail-types";
import { useAuthStore } from "@/store";

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

interface ApproveAction {
  headerLabel: string;
  dialogTitle: string;
  confirmLabel: string;
  loadingLabel: string;
  icon: typeof Send;
}

export function getApproveAction(claimType: string, gmailConnected: boolean): ApproveAction {
  switch (claimType) {
    case "email":
      return gmailConnected
        ? {
            headerLabel: "Approve and send",
            dialogTitle: "Send claim email",
            confirmLabel: "Send email",
            loadingLabel: "Sending…",
            icon: Send,
          }
        : {
            headerLabel: "Approve",
            dialogTitle: "Approve email draft",
            confirmLabel: "Approve",
            loadingLabel: "Approving…",
            icon: Check,
          };
    case "chat_script":
      return {
        headerLabel: "Approve",
        dialogTitle: "Approve chat script",
        confirmLabel: "Approve",
        loadingLabel: "Approving…",
        icon: Check,
      };
    case "in_store_guide":
      return {
        headerLabel: "Approve",
        dialogTitle: "Approve store guide",
        confirmLabel: "Approve",
        loadingLabel: "Approving…",
        icon: Check,
      };
    case "self_service_walkthrough":
      return {
        headerLabel: "Approve",
        dialogTitle: "Approve walkthrough",
        confirmLabel: "Approve",
        loadingLabel: "Approving…",
        icon: Check,
      };
    default:
      return {
        headerLabel: "Approve",
        dialogTitle: "Approve claim",
        confirmLabel: "Approve",
        loadingLabel: "Approving…",
        icon: Check,
      };
  }
}

function summaryCopy(claim: ClaimDetail, gmailConnected: boolean): string {
  const platform = claim.platform;
  const claimType = claim.claim_type satisfies ClaimDetailDraftType;
  switch (claimType) {
    case "email":
      return gmailConnected
        ? `This will send your price match request to ${platform} from your Gmail. You'll be notified when they respond.`
        : `Approving locks this email draft. Connect Gmail in Settings to send automatically, or copy the draft and send it yourself.`;
    case "chat_script":
      return `This locks your ${platform} chat script. You can copy it step by step and start the chat whenever you're ready.`;
    case "in_store_guide":
      return `This locks your ${platform} in-store guide. Download or print it when you're ready to visit.`;
    case "self_service_walkthrough":
      return `This locks your ${platform} walkthrough. Follow the steps at your own pace — the Assistant is here if you need help.`;
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
  const gmailConnected = useAuthStore((s) => s.user?.gmail_integration?.connected ?? false);
  const action = getApproveAction(claim.claim_type, gmailConnected);
  const description = summaryCopy(claim, gmailConnected);
  const ActionIcon = action.icon;

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
    // Pre-approve validation for dirty self-service drafts: when the
    // reviewer clicks "Approve and send" with unsaved edits, the body
    // includes `edited_draft_content` straight from the editor, which
    // bypasses `DraftPane.handleSave`'s JSON shape guard. Apply the
    // same guard here so malformed `self_service_walkthrough` JSON
    // never makes it server-side (CodeRabbit MAJOR, PR #168).
    if (
      dirty &&
      claim.claim_type === "self_service_walkthrough" &&
      !isValidSelfServiceJson(editedDraftContent)
    ) {
      toast.error("Invalid walkthrough format — fix the JSON before approving");
      return;
    }
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
        toast.success("Claim approved");
      } catch {
        // Show ONLY the refresh-failure toast (not the success toast)
        // so the user doesn't get a confusing double-toast. The
        // approve itself succeeded; the optimistic patch is in state;
        // reload syncs to server truth (CodeRabbit MINOR, PR #168).
        toast.error("Claim approved, but refresh failed. Reload to see latest state.");
      }
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
      <DialogContent showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>{action.dialogTitle}</DialogTitle>
          {/* `break-words` on the description so any policy-derived dynamic
              string the copy embeds (e.g. a long policy.claim_email like
              `customer-care.price-match@somelongdomain.example.com`) wraps
              inside the dialog instead of pushing the footer buttons past
              the dialog frame — same prod-verification fix that removed
              the raw policy.claim_url from the self-service branch. */}
          <DialogDescription className="break-words">{description}</DialogDescription>
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
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {action.loadingLabel}
              </>
            ) : (
              <>
                <ActionIcon className="mr-2 h-4 w-4" />
                {action.confirmLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
