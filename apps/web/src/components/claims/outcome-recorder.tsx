"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClaimsApiError, recordClaimOutcome } from "@/lib/api/claims";
import { cn } from "@/lib/utils";

type FormMode = "idle" | "approved" | "denied";

type DenialChip = "policy_expired" | "not_eligible" | "other" | null;

const DENIAL_CHIP_LABELS: Record<Exclude<DenialChip, null>, string> = {
  policy_expired: "Policy expired",
  not_eligible: "Not eligible",
  other: "Other",
};

export type RecordedOutcome = {
  outcome: "approved" | "denied";
  reclaimed_amount: number | null;
  outcome_note: string | null;
};

interface OutcomeRecorderProps {
  claimId: string;
  defaultAmount: number;
  promptLabel?: React.ReactNode;
  onRecorded: (result: RecordedOutcome) => void | Promise<void>;
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function OutcomeRecorder({
  claimId,
  defaultAmount,
  promptLabel,
  onRecorded,
}: OutcomeRecorderProps) {
  const [mode, setMode] = useState<FormMode>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountInput, setAmountInput] = useState(() => String(defaultAmount));
  const [amountHint, setAmountHint] = useState<string | null>(null);
  const [denialChip, setDenialChip] = useState<DenialChip>(null);
  const [denialOtherText, setDenialOtherText] = useState("");

  const resetForms = () => {
    setMode("idle");
    setAmountInput(String(defaultAmount));
    setAmountHint(null);
    setDenialChip(null);
    setDenialOtherText("");
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

  const finish = async (result: RecordedOutcome, successMsg: string) => {
    try {
      await onRecorded(result);
      toast.success(successMsg);
    } catch {
      toast.error("Outcome recorded, but refresh failed. Reload to see latest state.");
    }
    resetForms();
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
      await recordClaimOutcome(claimId, {
        outcome: "approved",
        reclaimed_amount: parsed,
      });
      await finish(
        { outcome: "approved", reclaimed_amount: parsed, outcome_note: null },
        "Recorded — added to your reclaimed total.",
      );
    } catch (err: unknown) {
      const message = err instanceof ClaimsApiError ? err.message : "Could not record outcome";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDenied = async () => {
    if (isSubmitting) return;
    const denialReason = resolveDenialReason();
    setIsSubmitting(true);
    try {
      await recordClaimOutcome(claimId, {
        outcome: "denied",
        denial_reason: denialReason,
      });
      await finish(
        { outcome: "denied", reclaimed_amount: null, outcome_note: denialReason ?? null },
        "Outcome recorded.",
      );
    } catch (err: unknown) {
      const message = err instanceof ClaimsApiError ? err.message : "Could not record outcome";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-neutral-700 text-sm">{promptLabel ?? "Heard back?"}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setAmountInput(String(defaultAmount));
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
            <label htmlFor={`reclaimed-amount-${claimId}`} className="text-neutral-600 text-xs">
              Refund amount
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500 text-sm">
                $
              </span>
              <Input
                id={`reclaimed-amount-${claimId}`}
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
    </>
  );
}
