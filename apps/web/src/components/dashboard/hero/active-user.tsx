"use client";

import { ChevronRight, Clock, FileText, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function HeroActiveUser({
  claimsInProgress,
  purchasesMonitored,
  windowsEndingSoon,
}: {
  claimsInProgress: number;
  purchasesMonitored: number;
  windowsEndingSoon: number;
}) {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-6 lg:p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            {claimsInProgress} claims in progress · {purchasesMonitored} purchases monitored
          </h2>
          <p className="text-neutral-600 mt-1">
            ClaimIt is watching your active purchase windows and will surface actions when something
            needs review.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-primary-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-brand-primary-600" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-neutral-900">{claimsInProgress}</div>
                <div className="text-sm text-neutral-600">Claims in progress</div>
              </div>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-primary-100 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-brand-primary-600" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-neutral-900">{purchasesMonitored}</div>
                <div className="text-sm text-neutral-600">Purchases monitored</div>
              </div>
            </div>
          </div>

          <div className="bg-semantic-warning-bg rounded-lg p-4 border border-semantic-warning/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-semantic-warning/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-semantic-warning" aria-hidden="true" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-neutral-900">{windowsEndingSoon}</div>
                <div className="text-sm text-neutral-600">Windows ending soon</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Link
            href="/claims"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex items-center",
            )}
          >
            Review claims
            <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
