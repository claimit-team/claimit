"use client";

import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { ClaimOutcomeBadge } from "@/components/claims/claim-outcome-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { claimTypeLabel } from "@/lib/claims-status";
import {
  formatPurchaseCurrency,
  formatPurchaseDate,
  type RelatedClaimBrief,
} from "@/lib/purchase-detail-view";

interface RelatedClaimsCardProps {
  claims: RelatedClaimBrief[];
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || currency === null) return "—";
  return formatPurchaseCurrency(amount, currency);
}

function formatCreated(createdAt: string | null): string {
  if (createdAt === null) return "—";
  return `Created ${formatPurchaseDate(createdAt)}`;
}

export function RelatedClaimsCard({ claims }: RelatedClaimsCardProps) {
  if (claims.length === 0) {
    return null;
  }

  return (
    <Card className="bg-neutral-0">
      <CardHeader>
        <CardTitle className="font-semibold text-lg text-neutral-900">
          Claims on this purchase
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {claims.map((claim) => {
            // Approved claims surface as "money won" — match the
            // /claims list amount-color convention so the same outcome
            // reads the same way across the two pages.
            const isApproved = claim.outcome === "approved";
            return (
              <Link
                key={claim.claimId}
                href={`/claims/${claim.claimId}`}
                className="group flex items-center justify-between rounded-lg border border-neutral-200 p-4 transition-colors hover:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-50 text-neutral-500">
                    <FileText className="size-4" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900 text-sm">
                        {claimTypeLabel(claim.claimType)}
                      </span>
                      <ClaimOutcomeBadge outcome={claim.outcome} />
                    </div>
                    <p className="text-neutral-500 text-xs">{formatCreated(claim.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`font-medium text-sm tabular-nums ${
                      isApproved ? "text-brand-accent-500" : "text-neutral-700"
                    }`}
                  >
                    {formatAmount(claim.amount, claim.currency)}
                  </span>
                  <ArrowRight className="size-4 text-neutral-500 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
