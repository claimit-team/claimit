"use client";

import { Loader2, XCircle } from "lucide-react";
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
import {
  ClaimsApiError,
  type RecordClaimOutcomeResponse,
  recordClaimOutcome,
} from "@/lib/api/claims";
import { cn } from "@/lib/utils";

const DENIAL_REASONS = ["Policy expired", "Not eligible", "Other"] as const;

type DenialReason = (typeof DENIAL_REASONS)[number];

type OutcomeDeniedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: string;
  platformLabel: string;
  onRecorded: (result: RecordClaimOutcomeResponse) => Promise<void>;
};

export function OutcomeDeniedDialog({
  open,
  onOpenChange,
  claimId,
  platformLabel,
  onRecorded,
}: OutcomeDeniedDialogProps) {
  const [selectedReason, setSelectedReason] = useState<DenialReason | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setSelectedReason(null);
      setCustomReason("");
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean, eventDetails?: { cancel: () => void }) => {
    if (isSubmittingRef.current && !nextOpen) {
      eventDetails?.cancel();
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (isSubmittingRef.current) return;
    if (selectedReason === null) {
      toast.error("Pick a reason for the denial.");
      return;
    }
    const finalReason = selectedReason === "Other" ? customReason.trim() : selectedReason;
    if (selectedReason === "Other" && finalReason.length === 0) {
      toast.error("Describe the denial reason.");
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await recordClaimOutcome(claimId, {
        outcome: "denied",
        denial_reason: finalReason,
      });
      await onRecorded(result);
      toast.success("Outcome recorded.");
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
          <DialogTitle>Record denial</DialogTitle>
          <DialogDescription>What did {platformLabel} say about this claim?</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-2">
            {DENIAL_REASONS.map((reason) => {
              const isSelected = selectedReason === reason;
              return (
                <Button
                  key={reason}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting}
                  className={cn(
                    isSelected &&
                      "border-brand-primary-500 bg-brand-primary-50 text-brand-primary-500",
                  )}
                  onClick={() => setSelectedReason(reason)}
                >
                  {reason}
                </Button>
              );
            })}
          </div>

          {selectedReason === "Other" ? (
            <Input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              disabled={isSubmitting}
              placeholder={`Describe what ${platformLabel} said…`}
              maxLength={500}
            />
          ) : null}
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
          <Button
            type="button"
            variant="destructiveSolid"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Confirm denial
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
