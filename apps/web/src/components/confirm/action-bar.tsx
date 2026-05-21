"use client";

import { format, parseISO } from "date-fns";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  confirmPurchase,
  type DismissReason,
  dismissPurchase,
  type PurchaseDetailDoc,
  PurchasesApiError,
} from "@/lib/api/purchases";
import {
  buildCorrectedFields,
  type ConfirmFormState,
  getSubmitBlocker,
} from "@/lib/confirm-form-state";

interface ActionBarProps {
  purchase: PurchaseDetailDoc;
  /** Snapshot of the form state when the page loaded — diffed against `formState`. */
  initialFormState: ConfirmFormState;
  /** Live form state. */
  formState: ConfirmFormState;
}

/**
 * Confirm-page action bar (ticket 5.14 B7 — full wire-up).
 *
 * Confirm: POSTs `{ corrected_fields }` (only if the form diff is
 * non-empty) to `/api/v1/purchases/:id/confirm`. The backend
 * recomputes `window_expires` from policy.window_days, branches
 * status, and returns the fresh doc. On success: toast naming the
 * product + the new monitoring window, then route to
 * `/purchases/:id`. On the rare branch-to-pending-confirmation (e.g.
 * user corrected the platform to one without a policy) the server
 * returns the unchanged status — we keep the toast generic so we
 * don't lie.
 *
 * Dismiss: opens a Dialog with a reason RadioGroup
 * (`Not an order` / `Duplicate` / `Other`). When the user picks
 * `Not an order` AND the purchase carries a `sender` (Gmail source),
 * a "Skip future emails from this sender" checkbox surfaces — the
 * only shape that can actually write a skiplist entry server-side.
 * For `Duplicate` / `Other` the checkbox is hidden, matching the
 * backend's "never write skiplist for these reasons" semantics
 * (see `apps/api-gateway/src/services/purchases.py`). On success:
 *   - `skiplist_written=true` → toast names the skip;
 *   - otherwise → neutral "Receipt ignored" toast;
 * then route to `/dashboard`.
 *
 * Cancel: routes to `/dashboard`. The pre-5.14 "back to /upload"
 * branch is gone because the standalone /upload page was deleted in
 * B2 (the global upload dialog opens from any page) — every entry
 * point (sidebar action, dashboard hero, proactive nudge, email
 * deep-link) lands on the same exit. If a future "came from email"
 * surface needs differentiation, the doc's `ingestion_source` is
 * enough to branch without storing browser history.
 *
 * Buttons stay disabled while either POST is in-flight so the user
 * can't double-fire confirm + dismiss.
 */
export function ActionBar({ purchase, initialFormState, formState }: ActionBarProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState<DismissReason>("not_an_order");
  const [rememberSender, setRememberSender] = useState(false);

  const submitBlocker = getSubmitBlocker(formState);

  const hasSender = typeof purchase.sender === "string" && purchase.sender.trim().length > 0;
  const showSkipSender = dismissReason === "not_an_order" && hasSender;

  const handleCancel = () => router.push("/dashboard");

  const handleConfirm = async () => {
    if (submitting) return;
    if (submitBlocker) {
      toast.error(submitBlocker);
      return;
    }
    setSubmitting(true);
    const patch = buildCorrectedFields(initialFormState, formState);
    try {
      const { purchase: updated } = await confirmPurchase(
        purchase._id,
        patch === undefined ? {} : { corrected_fields: patch },
      );
      toast.success(buildConfirmToast(updated, formState));
      router.push(`/purchases/${updated._id}`);
    } catch (err) {
      const message =
        err instanceof PurchasesApiError
          ? err.message
          : "We couldn't confirm this purchase. Try again.";
      toast.error(message);
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await dismissPurchase(purchase._id, {
        reason: dismissReason,
        // Backend ignores `remember_sender` for non-`not_an_order` reasons;
        // the FE additionally only sends `true` when the checkbox was
        // actually shown + checked so the wire payload reflects intent.
        remember_sender: showSkipSender ? rememberSender : false,
        // #103 shim: pass sender along until purchase docs are fetched
        // server-side by ID inside dismiss_purchase.
        ...(showSkipSender && rememberSender && hasSender
          ? { sender: purchase.sender as string }
          : {}),
      });
      setDismissOpen(false);
      if (result.skiplist_written) {
        toast.success("Receipt ignored — we'll skip future emails from this sender too.");
      } else {
        toast.success("Receipt ignored. ClaimIt won't monitor it.");
      }
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof PurchasesApiError
          ? err.message
          : "We couldn't ignore this receipt. Try again.";
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

          <Dialog
            open={dismissOpen}
            onOpenChange={(next) => {
              // Reset selections on close so re-opening shows the
              // default (Not an order, unchecked) — matches v0.
              if (!next) {
                setDismissReason("not_an_order");
                setRememberSender(false);
              }
              setDismissOpen(next);
            }}
          >
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
                  Tell us why — it helps us send fewer of these in the future.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 py-2">
                <RadioGroup
                  value={dismissReason}
                  onValueChange={(v) => setDismissReason((v ?? "not_an_order") as DismissReason)}
                  disabled={submitting}
                >
                  <DismissReasonRow
                    value="not_an_order"
                    label="Not an order"
                    description="This receipt isn't an order we should monitor (e.g. shipping update, account alert, marketing)."
                  />
                  <DismissReasonRow
                    value="duplicate"
                    label="Duplicate"
                    description="We already track this purchase — no need to start a second monitor."
                  />
                  <DismissReasonRow
                    value="other"
                    label="Other"
                    description="None of the above. We'll still skip monitoring."
                  />
                </RadioGroup>

                {showSkipSender ? (
                  <label className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                    <input
                      type="checkbox"
                      checked={rememberSender}
                      onChange={(e) => setRememberSender(e.target.checked)}
                      disabled={submitting}
                      className="mt-0.5 size-4 cursor-pointer rounded border-neutral-300 text-brand-primary-500 focus:ring-brand-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="text-sm text-neutral-700">
                      Skip future emails from <span className="font-medium">{purchase.sender}</span>
                      <span className="block text-xs text-neutral-500">
                        We won't auto-monitor anything else from this sender.
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>

              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="outline" disabled={submitting} />}
                >
                  Go back
                </DialogClose>
                <Button
                  type="button"
                  className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
                  disabled={submitting}
                  onClick={handleDismiss}
                >
                  {submitting ? "Ignoring…" : "Yes, ignore"}
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

function DismissReasonRow({
  value,
  label,
  description,
}: {
  value: DismissReason;
  label: string;
  description: string;
}) {
  const id = `dismiss-${value}`;
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <Label htmlFor={id} className="flex flex-col gap-0.5 font-normal cursor-pointer">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        <span className="text-xs text-neutral-500">{description}</span>
      </Label>
    </div>
  );
}

/**
 * Compose the post-confirm toast. Prefer the user-edited product
 * name (`formState.productName`) over the server doc for naming —
 * the patch may not have round-tripped through the response by the
 * time the toast fires. Window comes from the server doc because
 * the FE doesn't know `policy.window_days`; if the server returned
 * a parseable date, we name it; otherwise the toast stays generic
 * ("we'll alert you if the price drops") so we don't lie.
 */
function buildConfirmToast(updated: PurchaseDetailDoc, formState: ConfirmFormState): string {
  const product = formState.productName?.trim() || updated.product_name?.trim() || "this purchase";
  const windowExpires = updated.window_expires;
  if (windowExpires) {
    try {
      const dt = parseISO(windowExpires);
      if (!Number.isNaN(dt.getTime())) {
        return `Now monitoring ${product} — we'll alert you if the price drops before ${format(dt, "MMM d, yyyy")}.`;
      }
    } catch {
      // fall through to the generic copy
    }
  }
  return `Now monitoring ${product} — we'll alert you if the price drops.`;
}
