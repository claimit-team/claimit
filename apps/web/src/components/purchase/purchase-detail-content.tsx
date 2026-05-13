"use client";

import { useMemo, useState } from "react";

import type { PurchaseDetailMonitoringStatus, PurchaseDetailViewModel } from "@/lib/mock-purchases";

import {
  OriginalPurchaseDetails,
  type PurchaseOriginalDetailsModel,
} from "./original-purchase-details";
import { PriceHistoryChart } from "./price-history-chart";
import { PurchasePageHeader, type PurchasePageHeaderModel } from "./purchase-page-header";
import { RefundEligibilityCard } from "./refund-eligibility-card";
import { RelatedClaimsCard } from "./related-claims-card";

export function PurchaseDetailContent({
  purchase: initial,
}: {
  purchase: PurchaseDetailViewModel;
}) {
  const [monitoringStatus, setMonitoringStatus] = useState<PurchaseDetailMonitoringStatus>(
    () => initial.monitoringStatus,
  );

  const headerModel: PurchasePageHeaderModel = useMemo(
    () => ({
      productTitle: initial.title,
      monitoringStatus,
      platform: initial.platform,
      category: initial.category,
      purchaseDate: initial.purchaseDate,
      orderId: initial.orderId,
      primaryRelatedClaimId: initial.relatedClaims[0]?.claimId,
    }),
    [initial, monitoringStatus],
  );

  const originalModel: PurchaseOriginalDetailsModel = useMemo(
    () => ({
      source: initial.purchaseSource,
      platform: initial.platform,
      productName: initial.title,
      orderId: initial.orderId,
      purchaseDate: initial.purchaseDate,
      pricePaid: initial.pricePaid,
      currency: initial.currency,
      category: initial.category,
      memberTier: initial.memberTier,
      sourceEmail: initial.sourceEmail,
    }),
    [initial],
  );

  return (
    <div className="mx-auto max-w-[960px] px-4 py-6 lg:px-6">
      <div className="space-y-6">
        <PurchasePageHeader purchase={headerModel} onMonitoringStatusChange={setMonitoringStatus} />

        <PriceHistoryChart
          priceHistory={initial.priceHistory}
          pricePaid={initial.pricePaid}
          currency={initial.currency}
          currentPrice={initial.currentPrice}
          lowestSeen={initial.lowestSeen}
          highestSeen={initial.highestSeen}
          lastChecked={initial.lastCheckedIso}
          platform={initial.platform}
        />

        <RefundEligibilityCard
          status={monitoringStatus}
          daysRemaining={initial.daysRemaining}
          purchaseDate={initial.purchaseDate}
          windowEndDate={initial.windowEndDate}
          policySummary={initial.policySummary}
        />

        <RelatedClaimsCard claims={initial.relatedClaims} />

        <OriginalPurchaseDetails purchase={originalModel} />
      </div>
    </div>
  );
}
