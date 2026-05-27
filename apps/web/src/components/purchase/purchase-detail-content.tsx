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
  // Header monitoring status is no longer locally mutable — the real
  // detail page reads it from the server response. "Stop monitoring"
  // and "Re-upload receipt" header actions are disabled with a TODO
  // (decision 3 in the review): there's no backend endpoint that
  // implements either today (POST /dismiss has a different semantic +
  // a fixed reason enum; receipt re-upload belongs in the 5.13 upload
  // flow), and we deliberately don't fake mutation success.
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
      sourceEmail: initial.sourceEmail ?? undefined,
    }),
    [initial],
  );

  return (
    <div className="mx-auto max-w-[960px] px-4 py-6 lg:px-6">
      <div className="space-y-6">
        <PurchasePageHeader purchase={headerModel} />

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

        <OriginalPurchaseDetails purchase={originalModel} />
      </div>
    </div>
  );
}
