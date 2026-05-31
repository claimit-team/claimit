"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClaimsApiError,
  type RecordClaimOutcomeResponse,
  recordClaimOutcome,
} from "@/lib/api/claims";

type OutcomeApprovedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: string;
  defaultAmount: number | null;
  platformLabel: string;
  onRecorded: (result: RecordClaimOutcomeResponse) => Promise<void>;
};

export function OutcomeApprovedDialog({
  open,
  onOpenChange,
  claimId,
  defaultAmount,
  platformLabel,
  onRecorded,
}: OutcomeApprovedDialogProps) {
  const [amountInput, setAmountInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setAmountInput(defaultAmount != null ? String(defaultAmount) : "");
    }
  }, [open, defaultAmount]);

  const handleOpenChange = (nextOpen: boolean, eventDetails?: { cancel: () => void }) => {
    if (isSubmittingRef.current && !nextOpen) {
      eventDetails?.cancel();
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (isSubmittingRef.current) return;
    const parsed = Number.parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a refund amount greater than zero.");
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await recordClaimOutcome(claimId, {
        outcome: "approved",
        reclaimed_amount: parsed,
      });
      await onRecorded(result);
      toast.success("Outcome recorded — refund logged.");
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof ClaimsApiError
          ? err.message
          : "Couldn't record the outcome. Please try again.";
      toast.error(message);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal={isSubmitting}>
      <DialogContent showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Record approved refund</DialogTitle>
          <DialogDescription>How much did {platformLabel} refund for this claim?</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="approved-refund-amount" className="text-sm">
            Refund amount (USD)
          </Label>
          <Input
            id="approved-refund-amount"
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={isSubmitting}
            placeholder="0.00"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
