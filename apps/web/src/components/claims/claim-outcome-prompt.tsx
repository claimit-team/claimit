"use client";

/**
 * Outcome reporting card for submitted claims (post PR #219).
 *
 * Renders below PostApproveBanner when `claim.status === "submitted"`.
 * Lets the user record merchant approval (with optional custom refund
 * amount) or denial (with optional reason). On success, applies an
 * optimistic wire patch and refetches so the header terminal UI and
 * dashboard savings pick up the real `reclaimed_amount`.
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type ClaimDetailDoc, ClaimsApiError, recordClaimOutcome } from "@/lib/api/claims";
import type { ClaimDetail } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

type FormMode = "idle" | "approved" | "denied";

type DenialChip = "policy_expired" | "not_eligible" | "other" | null;

const DENIAL_CHIP_LABELS: Record<Exclude<DenialChip, null>, string> = {
  policy_expired: "Policy expired",
  not_eligible: "Not eligible",
  other: "Other",
};

interface ClaimOutcomePromptProps {
  claim: ClaimDetail;
  refetch: () => Promise<void>;
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function ClaimOutcomePrompt({ claim, refetch, applyOptimistic }: ClaimOutcomePromptProps) {
  const [mode, setMode] = useState<FormMode>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountInput, setAmountInput] = useState(() => String(claim.refund_amount));
  const [amountHint, setAmountHint] = useState<string | null>(null);
  const [denialChip, setDenialChip] = useState<DenialChip>(null);
  const [denialOtherText, setDenialOtherText] = useState("");

  if (claim.status !== "submitted") return null;

  const resetForms = () => {
    setMode("idle");
    setAmountInput(String(claim.refund_amount));
    setAmountHint(null);
    setDenialChip(null);
    setDenialOtherText("");
  };

  const handleConfirmApproved = async () => {
    if (isSubmitting) return;
    const parsed = parseAmount(amountInput);
    if (parsed === null || parsed <= 0) {
      setAmountHint("Enter an amount greater than zero.");
      return;
    }
    setAmountHint(null);
    setIsSubmitting(true);
    try {
      await recordClaimOutcome(claim.claim_id, {
        outcome: "approved",
        reclaimed_amount: parsed,
      });
      applyOptimistic({
        outcome: "approved",
        reclaimed_amount: parsed,
        resolved_at: new Date().toISOString(),
        outcome_note: null,
      });
      try {
        await refetch();
        toast.success("Recorded — added to your reclaimed total.");
      } catch {
        toast.error("Outcome recorded, but refresh failed. Reload to see latest state.");
      }
      resetForms();
    } catch (err: unknown) {
      const message = err instanceof ClaimsApiError ? err.message : "Could not record outcome";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolveDenialReason = (): string | undefined => {
    if (denialChip === "policy_expired") return DENIAL_CHIP_LABELS.policy_expired;
    if (denialChip === "not_eligible") return DENIAL_CHIP_LABELS.not_eligible;
    if (denialChip === "other") {
      const trimmed = denialOtherText.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  };

  const handleConfirmDenied = async () => {
    if (isSubmitting) return;
    const denialReason = resolveDenialReason();
    setIsSubmitting(true);
    try {
      await recordClaimOutcome(claim.claim_id, {
        outcome: "denied",
        denial_reason: denialReason,
      });
      applyOptimistic({
        outcome: "denied",
        reclaimed_amount: null,
        resolved_at: new Date().toISOString(),
        outcome_note: denialReason ?? null,
      });
      try {
        await refetch();
        toast.success("Outcome recorded.");
      } catch {
        toast.error("Outcome recorded, but refresh failed. Reload to see latest state.");
      }
      resetForms();
    } catch (err: unknown) {
      const message = err instanceof ClaimsApiError ? err.message : "Could not record outcome";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mx-4 mt-0 rounded-none border-x-0 border-t-0 border-neutral-200 lg:mx-6">
      <CardContent className="px-0 py-3">
        {mode === "idle" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-neutral-700 text-sm">
              Heard back from <strong className="font-medium">{claim.platform}</strong>?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setAmountInput(String(claim.refund_amount));
                  setAmountHint(null);
                  setMode("approved");
                }}
              >
                Approved / refunded
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={isSubmitting}
                onClick={() => setMode("denied")}
              >
                Denied
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "approved" ? (
          <div className="space-y-3">
            <p className="font-medium text-neutral-900 text-sm">How much did you get back?</p>
            <div className="flex max-w-xs flex-col gap-1">
              <label htmlFor="reclaimed-amount" className="text-neutral-600 text-xs">
                Refund amount
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500 text-sm">
                  $
                </span>
                <Input
                  id="reclaimed-amount"
                  type="text"
                  inputMode="decimal"
                  className="pl-7"
                  value={amountInput}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    if (amountHint) setAmountHint(null);
                  }}
                />
              </div>
              {amountHint ? <p className="text-semantic-danger text-xs">{amountHint}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleConfirmApproved()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={isSubmitting}
                onClick={resetForms}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "denied" ? (
          <div className="space-y-3">
            <p className="font-medium text-neutral-900 text-sm">What happened?</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DENIAL_CHIP_LABELS) as Array<Exclude<DenialChip, null>>).map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={isSubmitting}
                  className={cn(
                    denialChip === key &&
                      "border-brand-primary-500 bg-brand-primary-50 text-brand-primary-500",
                  )}
                  onClick={() => setDenialChip(key)}
                >
                  {DENIAL_CHIP_LABELS[key]}
                </Button>
              ))}
            </div>
            {denialChip === "other" ? (
              <Input
                type="text"
                placeholder="Brief reason (optional)"
                value={denialOtherText}
                disabled={isSubmitting}
                onChange={(e) => setDenialOtherText(e.target.value)}
                className="max-w-md"
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleConfirmDenied()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={isSubmitting}
                onClick={resetForms}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
