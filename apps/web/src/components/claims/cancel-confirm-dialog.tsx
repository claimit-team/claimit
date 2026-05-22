"use client";

/**
 * Cancel-claim confirm dialog (5.7 WI-7).
 *
 * Opens when the header's "Cancel claim" button is clicked. The user
 * picks a reason from a small allow-list (`Not worth it`,
 * `Already refunded`) or "Other" with a free-text Textarea. The
 * reason is forwarded to `POST /api/v1/claims/:id/cancel`; the
 * backend stores it as `outcome_note`, and the view-model surfaces
 * it via `claim.cancel_reason` for the header's `cancelled` branch.
 *
 * On confirm: optimistic flip to `outcome === "user_cancelled"`
 * (mapped to the new `cancelled` workflow status), then refetch +
 * toast. On error: refetch (reconcile to server truth) + toast.error.
 */

import { Loader2, XCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { type ClaimDetailDoc, cancelClaim } from "@/lib/api/claims";
import type { ClaimDetail } from "@/lib/claim-detail-types";

interface CancelConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: ClaimDetail;
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
  refetch: () => Promise<void>;
}

type ReasonOption = "not_worth_it" | "already_refunded" | "other";

const REASON_LABELS: Record<ReasonOption, string> = {
  not_worth_it: "Not worth it",
  already_refunded: "Already refunded",
  other: "Other",
};

export function CancelConfirmDialog({
  open,
  onOpenChange,
  claim,
  applyOptimistic,
  refetch,
}: CancelConfirmDialogProps) {
  const [reason, setReason] = useState<ReasonOption>("not_worth_it");
  const [otherText, setOtherText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const otherTextareaId = useId();

  // Reset form whenever the dialog closes so the next opening starts
  // clean rather than carrying over a stale "Other" buffer.
  useEffect(() => {
    if (!open) {
      setReason("not_worth_it");
      setOtherText("");
      setIsSubmitting(false);
    }
  }, [open]);

  const submitDisabled = isSubmitting || (reason === "other" && otherText.trim() === "");

  const handleConfirm = async () => {
    if (submitDisabled) return;
    const reasonText = reason === "other" ? otherText.trim() : REASON_LABELS[reason];
    setIsSubmitting(true);
    try {
      await cancelClaim(claim.claim_id, { reason: reasonText });
      // Cancel write succeeded — apply the optimistic patch + close the
      // dialog regardless of whether the follow-up refetch lands. A
      // refetch-only failure does NOT mean the cancel failed; reporting
      // it as such would mislead the user into a retry on an already-
      // cancelled claim (CodeRabbit MAJOR finding, PR #168).
      const nowIso = new Date().toISOString();
      applyOptimistic({
        outcome: "user_cancelled",
        outcome_note: reasonText,
        resolved_at: nowIso,
      });
      try {
        await refetch();
      } catch {
        toast.error("Claim cancelled, but refresh failed. Reload to see latest state.");
      }
      toast.success("Claim cancelled");
      onOpenChange(false);
    } catch (err: unknown) {
      // Write itself failed — surface the real error and let the user
      // retry. No optimistic patch was applied so there's nothing to
      // reconcile.
      const message = err instanceof Error ? err.message : "Could not cancel claim";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel claim</DialogTitle>
          <DialogDescription>
            Mark this {claim.platform} claim as cancelled. You won&apos;t be able to undo this.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <RadioGroup
            value={reason}
            onValueChange={(v) => {
              const next = (v ?? "not_worth_it") as ReasonOption;
              setReason(next);
            }}
            className="gap-2"
          >
            <ReasonRow value="not_worth_it" label={REASON_LABELS.not_worth_it} />
            <ReasonRow value="already_refunded" label={REASON_LABELS.already_refunded} />
            <ReasonRow value="other" label={REASON_LABELS.other} />
          </RadioGroup>

          {reason === "other" ? (
            <div className="space-y-1.5">
              <Label htmlFor={otherTextareaId} className="text-neutral-700 text-xs">
                Tell us why
              </Label>
              <Textarea
                id={otherTextareaId}
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Optional — helps us improve recommendations."
                className="min-h-20 text-sm"
                disabled={isSubmitting}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Keep claim
          </Button>
          <Button
            variant="destructive"
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitDisabled}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel claim
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonRow({ value, label }: { value: ReasonOption; label: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="cursor-pointer font-normal text-neutral-700 text-sm">
        {label}
      </Label>
    </div>
  );
}
