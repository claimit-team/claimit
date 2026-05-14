"use client";

import { Card, CardContent } from "@/components/ui/card";

export function HeroReclaimExperienced({
  reclaimedThisMonth,
  approvedClaimsReported,
  claimsInProgress,
  lifetimeReclaimed,
  averageReportedRefund,
}: {
  reclaimedThisMonth: number;
  approvedClaimsReported: number;
  claimsInProgress: number;
  lifetimeReclaimed: number;
  averageReportedRefund: number;
}) {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl font-bold text-brand-accent-500 tabular-nums">
                ${reclaimedThisMonth.toLocaleString()}
              </span>
              <span className="text-lg text-neutral-700">reclaimed this month</span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">Based on what you&apos;ve reported</p>
            <p className="text-neutral-600 mt-3">
              {approvedClaimsReported} claims you marked approved · {claimsInProgress} still in
              progress
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
            <div className="text-center lg:text-right">
              <div className="text-xl font-semibold text-neutral-900 tabular-nums">
                ${lifetimeReclaimed.toLocaleString()}
              </div>
              <div className="text-sm text-neutral-600">Lifetime reclaimed</div>
            </div>
            <div className="text-center lg:text-right">
              <div className="text-xl font-semibold text-neutral-900 tabular-nums">
                ${averageReportedRefund}
              </div>
              <div className="text-sm text-neutral-600">Average reported refund</div>
            </div>
            <div className="text-center lg:text-right">
              <div className="text-xl font-semibold text-neutral-900 tabular-nums">
                {claimsInProgress}
              </div>
              <div className="text-sm text-neutral-600">Claims in progress</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
