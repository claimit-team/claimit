"use client";

/**
 * Stop-monitoring confirm dialog (BUG-85).
 *
 * Opens from the purchase-detail header's "Stop monitoring" action.
 * Confirming calls `POST /api/v1/purchases/:id/stop-monitoring`, which
 * transitions the purchase to `dismissed` (rendered as a neutral
 * "Stopped" badge) and halts the price sweep. On success we refetch the
 * detail bundle via `onPurchaseUpdated` so the header reflects the new
 * state without a router refresh.
 *
 * Modeled on `claims/cancel-confirm-dialog.tsx`: a real confirm step
 * (this is a state change the user can't trivially undo) with an
 * in-flight guard that blocks Escape / backdrop dismissal mid-write so a
 * second submit can't be triggered on reopen.
 */

import { Loader2, StopCircle } from "lucide-react";
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
import { PurchasesApiError, stopMonitoring } from "@/lib/api/purchases";

interface StopMonitoringDialogProps {
  purchaseId: string;
  /** Display label for the purchase (e.g. "Best Buy") — surfaced in the
   * confirmation copy so the user knows exactly what stops. */
  platform: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Refetch the detail bundle after a successful stop. */
  onUpdated: () => void;
}

export function StopMonitoringDialog({
  purchaseId,
  platform,
  open,
  onOpenChange,
  onUpdated,
}: StopMonitoringDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Block Escape / backdrop / close-button dismissal while the stop is
  // in flight so a user can't tear down the dialog mid-write and
  // re-trigger the action on reopen.
  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await stopMonitoring(purchaseId);
      onUpdated();
      toast.success("Stopped monitoring this purchase.");
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof PurchasesApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't stop monitoring. Please try again.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Stop monitoring</DialogTitle>
          <DialogDescription>
            ClaimIt will stop tracking the price of this {platform} purchase. You won&apos;t get
            future price-drop alerts or refund claims for it. You can re-upload a receipt later to
            start over.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Keep monitoring
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Stopping…
              </>
            ) : (
              <>
                <StopCircle className="mr-2 size-4" />
                Stop monitoring
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
