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

import { OutcomeRecorder } from "@/components/claims/outcome-recorder";
import { Card, CardContent } from "@/components/ui/card";
import type { ClaimDetailDoc } from "@/lib/api/claims";
import type { ClaimDetail } from "@/lib/claim-detail-types";
import { toPlatformLabel } from "@/lib/claims-status";

interface ClaimOutcomePromptProps {
  claim: ClaimDetail;
  refetch: () => Promise<void>;
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
}

export function ClaimOutcomePrompt({ claim, refetch, applyOptimistic }: ClaimOutcomePromptProps) {
  if (claim.status !== "submitted") return null;

  return (
    <Card className="mx-4 mt-0 rounded-none border-x-0 border-t-0 border-neutral-200 lg:mx-6">
      <CardContent className="px-0 py-3">
        <OutcomeRecorder
          claimId={claim.claim_id}
          defaultAmount={claim.refund_amount}
          promptLabel={
            <>
              Heard back from{" "}
              <strong className="font-medium">{toPlatformLabel(claim.platform)}</strong>?
            </>
          }
          onRecorded={async (r) => {
            applyOptimistic({
              outcome: r.outcome,
              reclaimed_amount: r.reclaimed_amount,
              resolved_at: new Date().toISOString(),
              outcome_note: r.outcome_note,
            });
            await refetch();
          }}
        />
      </CardContent>
    </Card>
  );
}
