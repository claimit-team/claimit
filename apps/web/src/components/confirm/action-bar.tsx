"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { confirmPurchase, PurchasesApiError } from "@/lib/api/purchases";
import {
  buildCorrectedFields,
  type ConfirmFormState,
  getSubmitBlocker,
} from "@/lib/confirm-form-state";

interface ActionBarProps {
  purchaseId: string;
  /** Snapshot of the form state when the page loaded — diffed against `formState`. */
  initialFormState: ConfirmFormState;
  /** Live form state. */
  formState: ConfirmFormState;
}

/**
 * Confirm-page action bar (ticket 5.14 B4 — Confirm path).
 *
 * Reads the lifted form state from `ConfirmPurchaseContent`, computes
 * a `corrected_fields` diff against the initial snapshot, and POSTs
 * to `/api/v1/purchases/:id/confirm`. The backend's allow-list +
 * window-recompute owns the rest of the transition (5.14 PR-A).
 *
 * B7 will replace the dismiss path (currently a mock toast) with the
 * real `dismissPurchase` call + reason RadioGroup + skip-sender
 * checkbox + origin-aware exit. Leaving that scaffolding intact so
 * B4 stays surgical.
 */
export function ActionBar({ purchaseId, initialFormState, formState }: ActionBarProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const submitBlocker = getSubmitBlocker(formState);
  // Interim routing — the B7 commit replaces both of these with
  // origin-aware exits + the real dismiss API. Default to /dashboard
  // because the global upload dialog (B2) replaced the standalone
  // /upload page that this used to bounce back to.
  const handleCancel = () => router.push("/dashboard");

  const handleIgnore = () => {
    toast.success("Receipt ignored in this mock flow.");
    router.push("/dashboard");
  };

  const handleConfirm = async () => {
    if (submitting) return;
    if (submitBlocker) {
      toast.error(submitBlocker);
      return;
    }
    setSubmitting(true);
    const patch = buildCorrectedFields(initialFormState, formState);
    try {
      const { purchase } = await confirmPurchase(
        purchaseId,
        patch === undefined ? {} : { corrected_fields: patch },
      );
      toast.success("Confirmed. ClaimIt is monitoring this purchase now.");
      router.push(`/purchases/${purchase._id}`);
    } catch (err) {
      const message =
        err instanceof PurchasesApiError
          ? err.message
          : "We couldn't confirm this purchase. Try again.";
      toast.error(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-30 border-t border-neutral-200 bg-neutral-0 px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-neutral-500">
          {submitBlocker ?? "All your edits are local until you confirm"}
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="text-sm text-neutral-500 hover:text-neutral-700 hover:underline text-left sm:text-center disabled:opacity-50 disabled:hover:no-underline"
          >
            Cancel
          </button>

          <Dialog>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={submitting}
                />
              }
            >
              Ignore this
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ignore this receipt?</DialogTitle>
                <DialogDescription>
                  We&apos;ll skip it and won&apos;t monitor for price changes. You can always upload
                  it again later.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Go back
                </DialogClose>
                <Button
                  type="button"
                  className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
                  onClick={handleIgnore}
                >
                  Yes, ignore
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || submitBlocker !== null}
            className="bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0 w-full sm:w-auto"
          >
            {submitting ? "Confirming…" : "Confirm and start monitoring"}
          </Button>
        </div>
      </div>
    </div>
  );
}
