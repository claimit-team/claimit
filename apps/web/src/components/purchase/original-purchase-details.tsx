"use client";

import { ChevronDown, FileText } from "lucide-react";
import { useState } from "react";
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
} from "@/lib/mock-purchases";
import { cn } from "@/lib/utils";

export interface PurchaseOriginalDetailsModel {
  source: PurchaseDetailOriginalSource;
  platform: string;
  productName: string;
  orderId: string;
  purchaseDate: string;
  pricePaid: number;
  currency: string;
  category: PurchaseCategory;
  memberTier?: string;
  sourceEmail?: string;
}

interface OriginalPurchaseDetailsProps {
  purchase: PurchaseOriginalDetailsModel;
}

export function OriginalPurchaseDetails({ purchase }: OriginalPurchaseDetailsProps) {
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
    ...(purchase.memberTier ? [{ label: "Member tier", value: purchase.memberTier }] : []),
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
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Receipt</DialogTitle>
                  </DialogHeader>
                  <div className="flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 p-8">
                    <div className="text-center">
                      <FileText className="mx-auto size-16 text-neutral-400" aria-hidden />
                      <p className="mt-4 text-neutral-500 text-sm">
                        Receipt preview would be displayed here
                      </p>
                      <p className="text-neutral-400 text-xs">
                        {purchase.productName} — {purchase.orderId}
                      </p>
                    </div>
                  </div>
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
