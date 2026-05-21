"use client";

import {
  ArrowRight,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Receipt,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import type { ElementType } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatClaimCurrency } from "@/lib/claim-detail";
import type { ClaimDetail } from "@/lib/claim-detail-types";

interface EvidencePaneProps {
  claim: ClaimDetail;
  onDoubleClickHeader?: () => void;
}

function PaneHeader({
  title,
  icon: Icon,
  onDoubleClick,
}: {
  title: string;
  icon: ElementType;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full cursor-default items-center gap-2 border-neutral-200 border-b bg-neutral-0 px-4 py-3 text-left"
      onDoubleClick={onDoubleClick}
    >
      <Icon className="h-4 w-4 text-neutral-500" />
      <h3 className="font-medium text-neutral-900 text-sm">{title}</h3>
    </button>
  );
}

// Read-tolerant formatters: with real (sometimes-null) view-model data
// the input can be `""` (no `updated_at`/`purchase_date` on the wire
// doc) or a malformed ISO string. `new Date("")` produces an "Invalid
// Date" with NaN timestamp — formatting that would render literally
// "Invalid Date" in the UI. Guarding here keeps the rest of the pane
// crash-free without per-call-site null checks.
//
// `formatEvidenceDate` returns `null` (caller hides the Clock pill);
// `formatDateShort` returns `"—"` (caller shows the dash in place of
// a date).
function formatEvidenceDate(dateString: string): string | null {
  if (dateString === "") return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateShort(dateString: string): string {
  if (dateString === "") return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function ScreenshotPlaceholder() {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
      <div className="text-center">
        <ImageIcon className="mx-auto h-8 w-8 text-neutral-400" />
        <span className="mt-1 text-neutral-400 text-xs">Price screenshot</span>
      </div>
    </div>
  );
}

export function EvidencePane({ claim, onDoubleClickHeader }: EvidencePaneProps) {
  const { evidence, purchase } = claim;
  const priceDifference = evidence.original_price - evidence.current_price;
  // Lifted out of the JSX (was an IIFE) — purely a readability nit per
  // CodeRabbit. Behavior identical: `null` means "no valid date";
  // caller short-circuits the Clock pill.
  const capturedDate = formatEvidenceDate(evidence.captured_at);

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader title="Evidence" icon={FileText} onDoubleClick={onDoubleClickHeader} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <TrendingDown className="h-4 w-4 text-semantic-warning" />
                Current price
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div className="space-y-1">
                  <div className="text-neutral-500 text-sm tabular-nums">
                    Original: {formatClaimCurrency(evidence.original_price, claim.currency)}
                  </div>
                  <div className="font-semibold text-2xl text-neutral-900 tabular-nums">
                    {formatClaimCurrency(evidence.current_price, claim.currency)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-lg text-semantic-warning tabular-nums">
                    -{formatClaimCurrency(priceDifference, claim.currency)}
                  </div>
                  <div className="text-neutral-500 text-xs">difference</div>
                </div>
              </div>

              <Dialog>
                <DialogTrigger
                  render={<button type="button" className="w-full text-left outline-none" />}
                >
                  <ScreenshotPlaceholder />
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Price Screenshot</DialogTitle>
                  </DialogHeader>
                  <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-12 w-12 text-neutral-400" />
                      <span className="mt-2 text-neutral-400 text-sm">
                        Full price screenshot would appear here
                      </span>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex items-center justify-between text-neutral-500 text-xs">
                <span>Source: {claim.platform}</span>
                {capturedDate !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {capturedDate}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <FileText className="h-4 w-4" />
                {claim.platform} price match policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <blockquote className="border-brand-primary-500 border-l-2 pl-3 text-neutral-700 text-sm italic">
                {evidence.policy_clause}
              </blockquote>

              <Dialog>
                <DialogTrigger
                  render={
                    <Button
                      variant="link"
                      type="button"
                      className="h-auto gap-1 p-0 text-brand-primary-500"
                    />
                  }
                >
                  Read full policy
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{claim.platform} price match policy</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-96">
                    <div className="space-y-4 pr-4 text-neutral-700 text-sm">
                      <p>{evidence.policy_clause}</p>
                      <h4 className="font-medium text-neutral-900">Eligibility requirements</h4>
                      <ul className="list-disc space-y-1 pl-5">
                        <li>Keep your receipt or confirmation handy</li>
                        <li>Show the advertised lower eligible price when you reach out</li>
                        <li>Follow merchant-specific timing rules for adjustments</li>
                      </ul>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <Receipt className="h-4 w-4" />
                Your original purchase
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
                <div className="text-center">
                  <Receipt className="mx-auto h-6 w-6 text-neutral-400" />
                  <span className="mt-1 text-neutral-400 text-xs">Receipt</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Purchase date</span>
                  <span className="text-neutral-900">
                    {formatDateShort(purchase.purchase_date)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Order ID</span>
                  <span className="font-mono text-neutral-900">{purchase.order_id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Price paid</span>
                  <span className="font-medium text-neutral-900">
                    {formatClaimCurrency(purchase.price_paid, claim.currency)}
                  </span>
                </div>
              </div>

              <Link
                href={`/purchases/${purchase.purchase_id}`}
                className="inline-flex items-center gap-1 font-medium text-brand-primary-500 text-sm hover:underline"
              >
                View purchase
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
