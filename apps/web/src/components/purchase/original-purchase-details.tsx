"use client";

import { ChevronDown, FileText } from "lucide-react";
import { useState } from "react";
import { ReceiptPreview } from "@/components/confirm/receipt-preview";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  formatPurchaseCurrency,
  formatPurchaseDate,
  type PurchaseCategory,
  type PurchaseDetailOriginalSource,
} from "@/lib/purchase-detail-view";
import { cn } from "@/lib/utils";

export interface PurchaseOriginalDetailsModel {
  source: PurchaseDetailOriginalSource;
  platform: string;
  productName: string;
  orderId: string;
  /** `null` when the wire doc lacks both `purchase_date` and
   * `ingested_at`. Rendered via `formatPurchaseDate` which falls back
   * to a placeholder for null / malformed input. */
  purchaseDate: string | null;
  pricePaid: number;
  currency: string;
  category: PurchaseCategory;
  memberTier?: string;
  /** When the purchase has a member tier, surface BOTH the member
   * price (what was actually paid against) and the non-member list
   * price so the user understands the comparison the chart is making.
   * Both are null on a no-tier purchase. */
  memberPriceAtPurchase: number | null;
  nonMemberPriceAtPurchase: number | null;
  sourceEmail?: string;
}

interface OriginalPurchaseDetailsProps {
  purchase: PurchaseOriginalDetailsModel;
  /** Purchase id — drives the authenticated receipt-blob fetch in the
   * "View receipt" dialog. */
  purchaseId: string;
  /** Raw backend `ingestion_source` — forwarded to `ReceiptPreview`
   * so a Gmail-sourced (no stored attachment) purchase surfaces the
   * right "Original not available" copy. */
  ingestionSource: string | null;
}

export function OriginalPurchaseDetails({
  purchase,
  purchaseId,
  ingestionSource,
}: OriginalPurchaseDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sourceLabel =
    purchase.source === "upload"
      ? "Uploaded manually"
      : purchase.source === "email"
        ? `Auto-detected from Gmail (${purchase.sourceEmail ?? "orders@store.com"})`
        : "Connected via API";

  const detailItems = [
    { label: "Platform", value: purchase.platform },
    { label: "Product name", value: purchase.productName },
    { label: "Order ID", value: purchase.orderId },
    { label: "Purchase date", value: formatPurchaseDate(purchase.purchaseDate) },
    {
      label: "Price paid",
      value: formatPurchaseCurrency(purchase.pricePaid, purchase.currency),
    },
    { label: "Source", value: sourceLabel },
    // Member-tier rows only surface when the purchase had a tier; this
    // both keeps the layout tight for no-tier purchases and avoids
    // showing "—" for fields that are inherently inapplicable.
    ...(purchase.memberTier ? [{ label: "Member tier", value: purchase.memberTier }] : []),
    ...(purchase.memberTier && purchase.memberPriceAtPurchase !== null
      ? [
          {
            label: "Member price",
            value: formatPurchaseCurrency(purchase.memberPriceAtPurchase, purchase.currency),
          },
        ]
      : []),
    ...(purchase.memberTier && purchase.nonMemberPriceAtPurchase !== null
      ? [
          {
            label: "Non-member price",
            value: formatPurchaseCurrency(purchase.nonMemberPriceAtPurchase, purchase.currency),
          },
        ]
      : []),
    {
      label: "Category",
      value: `${purchase.category.charAt(0).toUpperCase()}${purchase.category.slice(1)}`,
    },
  ];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-neutral-0">
        <CollapsibleTrigger
          type="button"
          className="flex w-full items-center justify-between px-6 py-4 text-left outline-none"
        >
          <span className="font-semibold text-lg text-neutral-900">Original purchase details</span>
          <ChevronDown
            className={cn(
              "size-5 text-neutral-500 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Dialog>
                <DialogTrigger
                  render={
                    <button type="button" className="group shrink-0 text-left outline-none" />
                  }
                >
                  <div className="flex size-24 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 transition-colors group-hover:bg-neutral-100">
                    <FileText className="size-8 text-neutral-500" aria-hidden />
                  </div>
                  <p className="mt-1 text-neutral-500 text-xs group-hover:text-neutral-700">
                    View receipt
                  </p>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Receipt</DialogTitle>
                  </DialogHeader>
                  {/* Real authenticated blob fetch (shared with the confirm
                      flow). Streams `GET /api/v1/purchases/:id/receipt`
                      through the api-gateway proxy and renders the image /
                      PDF, or a tasteful "Original not available" fallback
                      for Gmail-sourced purchases that have no stored
                      attachment. */}
                  <ReceiptPreview
                    purchaseId={purchaseId}
                    ingestionSource={ingestionSource}
                    filename={null}
                  />
                </DialogContent>
              </Dialog>

              <dl className="flex-1 space-y-3">
                {detailItems.map((item) => (
                  <div key={item.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                    <dt className="w-32 shrink-0 text-neutral-500 text-sm">{item.label}</dt>
                    <dd className="font-medium text-neutral-900 text-sm">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
