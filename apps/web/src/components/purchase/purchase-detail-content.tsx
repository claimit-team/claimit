"use client";

import { useMemo } from "react";

import type { PurchaseDetailViewModel } from "@/lib/purchase-detail-view";

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
  onPurchaseUpdated,
}: {
  purchase: PurchaseDetailViewModel;
  /**
   * Trigger a refetch of the detail bundle. Wired to the parent page's
   * `reloadTick` so child mutations (today: add-product-url) take effect
   * without reaching for a router refresh.
   */
  onPurchaseUpdated: () => void;
}) {
  // Header monitoring status is read from the server response, not
  // locally mutated. The header's "Stop monitoring" and "Re-upload
  // receipt" actions (BUG-85) call real endpoints and refetch via
  // `onPurchaseUpdated` on success, so the status reflects server truth
  // rather than an optimistic flip.
  const monitoringStatus = initial.monitoringStatus;

  const headerModel: PurchasePageHeaderModel = useMemo(
    () => ({
      productTitle: initial.title,
      monitoringStatus,
      monitoringDegraded: initial.monitoringDegraded,
      platform: initial.platform,
      platformRaw: initial.platformRaw,
      category: initial.category,
      categoryRaw: initial.categoryRaw,
      purchaseDate: initial.purchaseDate,
      orderId: initial.orderId,
      primaryRelatedClaimId: initial.primaryRelatedClaimId ?? undefined,
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
      memberTier: initial.memberTier ?? undefined,
      memberPriceAtPurchase: initial.memberPriceAtPurchase,
      nonMemberPriceAtPurchase: initial.nonMemberPriceAtPurchase,
      fareClass: initial.fareClass,
      roomType: initial.roomType,
      bedType: initial.bedType,
      rateType: initial.rateType,
      sourceEmail: initial.sourceEmail ?? undefined,
    }),
    [initial],
  );

  return (
    <div className="mx-auto max-w-[960px] px-4 py-6 lg:px-6">
      <div className="space-y-6">
        <PurchasePageHeader
          purchase={headerModel}
          purchaseId={initial.purchaseId}
          onPurchaseUpdated={onPurchaseUpdated}
        />

        <PriceHistoryChart
          purchaseId={initial.purchaseId}
          priceHistory={initial.priceHistory}
          pricePaid={initial.pricePaid}
          currency={initial.currency}
          currentPrice={initial.currentPrice}
          lowestSeen={initial.lowestSeen}
          highestSeen={initial.highestSeen}
          lastChecked={initial.lastCheckedIso}
          platform={initial.platform}
          monitorError={initial.monitorError}
          monitorErrorAt={initial.monitorErrorAt}
          monitorErrorCode={initial.monitorErrorCode}
          onPurchaseUpdated={onPurchaseUpdated}
        />

        <RefundEligibilityCard
          status={monitoringStatus}
          daysRemaining={initial.daysRemaining}
          purchaseDate={initial.purchaseDate}
          windowEndDate={initial.windowEndDate}
          policySummary={initial.policySummary}
        />

        <RelatedClaimsCard claims={initial.relatedClaims} />

        <OriginalPurchaseDetails
          purchase={originalModel}
          purchaseId={initial.purchaseId}
          ingestionSource={initial.ingestionSourceRaw}
        />
      </div>
    </div>
  );
}
