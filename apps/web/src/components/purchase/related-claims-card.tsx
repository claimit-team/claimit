"use client";

import { ArrowRight, Mail, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatPurchaseCurrency,
  formatPurchaseDate,
  type RelatedClaimBrief,
  type RelatedClaimBriefStatus,
  type RelatedClaimType,
} from "@/lib/mock-purchases";

interface RelatedClaimsCardProps {
  claims: RelatedClaimBrief[];
}

const claimTypeIcons: Record<RelatedClaimType, ReactNode> = {
  chat_script: <MessageSquare className="size-4" />,
  email_template: <Mail className="size-4" />,
  phone_guide: <Phone className="size-4" />,
};

const claimTypeLabels: Record<RelatedClaimType, string> = {
  chat_script: "Chat script",
  email_template: "Email template",
  phone_guide: "Phone guide",
};

function statusBadgeVariant(
  status: RelatedClaimBriefStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "approved":
    case "resolved":
      return "default";
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}

function statusLabel(status: RelatedClaimBriefStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "awaiting_approval":
      return "Awaiting approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "resolved":
      return "Resolved";
    default:
      return status;
  }
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
            const isResolved = claim.status === "approved" || claim.status === "resolved";

            return (
              <Link
                key={claim.claimId}
                href={`/claims/${claim.claimId}`}
                className="group flex items-center justify-between rounded-lg border border-neutral-200 p-4 transition-colors hover:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-50 text-neutral-500">
                    {claimTypeIcons[claim.claimType]}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900 text-sm">
                        {claimTypeLabels[claim.claimType]}
                      </span>
                      <Badge variant={statusBadgeVariant(claim.status)}>
                        {statusLabel(claim.status)}
                      </Badge>
                    </div>
                    <p className="text-neutral-500 text-xs">
                      Created {formatPurchaseDate(claim.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`font-medium text-sm tabular-nums ${isResolved ? "text-semantic-success" : "text-neutral-700"}`}
                  >
                    {formatPurchaseCurrency(claim.amount, claim.currency)}
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
