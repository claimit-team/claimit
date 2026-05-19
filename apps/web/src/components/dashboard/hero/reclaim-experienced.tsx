"use client";

import { AnimatedCurrency } from "@/components/dashboard/hero/animated-currency";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Hero shown to users with prior reclamation history (lifetime savings > 0).
 *
 * Props are projections of GET /api/v1/dashboard/summary. Fields not yet
 * supported by 6.6 PR A — `approvedClaimsReported`, `averageReportedRefund` —
 * have been removed; reintroduce when the backend exposes them.
 */
export function HeroReclaimExperienced({
  reclaimedThisMonth,
  claimsInProgress,
  lifetimeReclaimed,
  purchasesMonitored,
}: {
  reclaimedThisMonth: number;
  claimsInProgress: number;
  lifetimeReclaimed: number;
  purchasesMonitored: number;
}) {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <AnimatedCurrency
                value={reclaimedThisMonth}
                className="text-4xl font-bold text-brand-accent-500 tabular-nums"
              />
              <span className="text-lg text-neutral-700">reclaimed this month</span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">Based on resolved claims this month</p>
            <p className="text-neutral-600 mt-3">
              {claimsInProgress} claims in progress · {purchasesMonitored} purchases monitored
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
            <div className="text-center lg:text-right">
              <AnimatedCurrency
                value={lifetimeReclaimed}
                className="text-xl font-semibold text-neutral-900 tabular-nums"
              />
              <div className="text-sm text-neutral-600">Lifetime reclaimed</div>
            </div>
            <div className="text-center lg:text-right">
              <div className="text-xl font-semibold text-neutral-900 tabular-nums">
                {claimsInProgress}
              </div>
              <div className="text-sm text-neutral-600">Claims in progress</div>
            </div>
            <div className="text-center lg:text-right">
              <div className="text-xl font-semibold text-neutral-900 tabular-nums">
                {purchasesMonitored}
              </div>
              <div className="text-sm text-neutral-600">Purchases monitored</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
