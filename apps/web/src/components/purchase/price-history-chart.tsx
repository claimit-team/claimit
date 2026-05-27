"use client";

import { AlertTriangle, CircleDot, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatPurchaseCurrency,
  formatPurchaseShortDate,
  getPurchaseRelativeTime,
  type PriceHistoryPointVm,
} from "@/lib/purchase-detail-view";
import { AddProductUrlDialog } from "./add-product-url-dialog";

interface PriceHistoryChartProps {
  purchaseId: string;
  priceHistory: PriceHistoryPointVm[];
  pricePaid: number;
  currency: string;
  currentPrice: number | null;
  lowestSeen: number | null;
  highestSeen: number | null;
  lastChecked: string | null;
  platform: string;
  /**
   * BUG-19: when the monitor cron is blocked the empty state renders a
   * real explanation + (where actionable) a remediation button instead
   * of the hopeful "waiting for snapshot" copy. `monitorErrorCode` is
   * the FE branching key — today one of `"missing_product_url"` or
   * `"adapter_error"`, with new codes accepted as the generic
   * adapter-error branch.
   */
  monitorError: string | null;
  monitorErrorAt: string | null;
  monitorErrorCode: string | null;
  onPurchaseUpdated: () => void;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: PriceHistoryPointVm;
  pricePaid: number;
}

function CustomDot({ cx, cy, payload, pricePaid }: CustomDotProps) {
  if (!payload) return null;
  const isBelowPaid = payload.price < pricePaid;
  if (!isBelowPaid) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill="var(--semantic-warning)"
      stroke="var(--neutral-0)"
      strokeWidth={2}
    />
  );
}

interface CustomTooltipProps {
  active?: boolean;
  currency: string;
  payload?: Array<{
    payload: PriceHistoryPointVm & { formattedDate?: string };
    value: number;
  }>;
}

function CustomTooltip({ active, currency, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const row = payload[0];
  const point = row.payload;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-0 px-3 py-2 shadow-md">
      <p className="font-medium text-neutral-900 text-sm tabular-nums">
        {formatPurchaseCurrency(row.value, currency)}
      </p>
      <p className="text-neutral-500 text-xs">on {formatPurchaseShortDate(point.date)}</p>
      {point.dropDetected && (
        <p className="mt-1 font-medium text-semantic-warning text-xs">Drop detected</p>
      )}
    </div>
  );
}

interface ChartEmptyStateProps {
  platform: string;
  monitorError: string | null;
  monitorErrorCode: string | null;
  onAddProductUrl: () => void;
}

/**
 * Empty-state rendering for the chart.
 *
 * Three branches, picked by `monitorErrorCode`:
 *
 * 1. `"missing_product_url"` — actionable. The user can paste a URL and
 *    unblock monitoring; show a button that opens the dialog.
 * 2. any other non-null code — non-actionable adapter failure. Show the
 *    backend's reason verbatim so the user understands they're not
 *    just waiting for the next sweep.
 * 3. null — the original hopeful copy (real freshly-monitored purchases
 *    routinely have zero snapshots until the first sweep lands).
 */
function ChartEmptyState({
  platform,
  monitorError,
  monitorErrorCode,
  onAddProductUrl,
}: ChartEmptyStateProps) {
  if (monitorErrorCode === "missing_product_url") {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-semantic-warning/40 border-dashed bg-semantic-warning/5 px-4 py-10 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-semantic-warning/10 text-semantic-warning">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <p className="mt-3 font-medium text-neutral-900 text-sm">Monitoring is blocked</p>
        <p className="mt-1 max-w-sm text-neutral-500 text-xs">
          This purchase doesn&apos;t have a product URL yet, so ClaimIt can&apos;t check the live{" "}
          {platform} price. Add a URL to start monitoring.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={onAddProductUrl}
        >
          Add product URL
        </Button>
      </div>
    );
  }

  // `!= null` (loose) instead of `!== null` so `undefined` from a backend
  // that doesn't yet expose the field falls back to the healthy state
  // instead of accidentally rendering this warning card on every purchase.
  if (monitorErrorCode != null) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-semantic-warning/40 border-dashed bg-semantic-warning/5 px-4 py-10 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-semantic-warning/10 text-semantic-warning">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <p className="mt-3 font-medium text-neutral-900 text-sm">
          Monitoring couldn&apos;t fetch a price yet
        </p>
        <p className="mt-1 max-w-sm text-neutral-500 text-xs">
          {monitorError ?? `ClaimIt is having trouble reading ${platform}. We'll keep retrying.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-neutral-200 border-dashed bg-neutral-50 px-4 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <Sparkles className="size-5" aria-hidden />
      </div>
      <p className="mt-3 font-medium text-neutral-900 text-sm">No price snapshots yet</p>
      <p className="mt-1 max-w-sm text-neutral-500 text-xs">
        ClaimIt is monitoring {platform}. Snapshots will appear here as soon as the next sweep
        records a price.
      </p>
    </div>
  );
}

export function PriceHistoryChart({
  purchaseId,
  priceHistory,
  pricePaid,
  currency,
  currentPrice,
  lowestSeen,
  highestSeen,
  lastChecked,
  platform,
  monitorError,
  monitorErrorAt,
  monitorErrorCode,
  onPurchaseUpdated,
}: PriceHistoryChartProps) {
  const hasData = priceHistory.length > 0;
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);

  const chartData = priceHistory.map((point) => ({
    ...point,
    formattedDate: formatPurchaseShortDate(point.date),
  }));

  let yMin = 0;
  let yMax = 0;
  if (hasData) {
    const seriesPrices = priceHistory.map((p) => p.price);
    const minPrice = Math.min(...seriesPrices, pricePaid);
    const maxPrice = Math.max(...seriesPrices, pricePaid);
    const padding = (maxPrice - minPrice) * 0.1 || 10;
    yMin = Math.floor(minPrice - padding);
    yMax = Math.ceil(maxPrice + padding);
  }

  // BUG-19: when the monitor is in an error state, the cron's
  // `last_checked_at` bump still happened (intentional, to throttle
  // retries on a broken adapter) — so reusing it as the footer's
  // "Updated …" timestamp would lie about the data state. Branch on
  // `monitorErrorCode` to surface the error timestamp + "Last check
  // failed" copy instead.
  const inErrorState = monitorErrorCode != null;
  const errorTimeAgo = monitorErrorAt !== null ? getPurchaseRelativeTime(monitorErrorAt) : null;
  const timeAgo = lastChecked !== null ? getPurchaseRelativeTime(lastChecked) : null;

  return (
    <Card className="bg-neutral-0">
      <CardHeader>
        <CardTitle className="font-semibold text-lg text-neutral-900">Price history</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {hasData ? (
              <ResponsiveContainer width="100%" height={280} className="max-md:h-[200px]!">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="formattedDate"
                    tick={{ fill: "var(--neutral-500)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--neutral-200)" }}
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    tick={{ fill: "var(--neutral-500)", fontSize: 12 }}
                    tickFormatter={(value) =>
                      currency === "USD" ? `$${value}` : formatPurchaseCurrency(value, currency)
                    }
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip content={<CustomTooltip currency={currency} />} />
                  <ReferenceLine
                    y={pricePaid}
                    stroke="var(--neutral-200)"
                    strokeDasharray="5 5"
                    label={{
                      value: `Paid ${formatPurchaseCurrency(pricePaid, currency)}`,
                      fill: "var(--neutral-500)",
                      fontSize: 11,
                      position: "right",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="var(--neutral-500)"
                    strokeWidth={2}
                    dot={<CustomDot pricePaid={pricePaid} />}
                    activeDot={{
                      r: 4,
                      fill: "var(--neutral-500)",
                      stroke: "var(--neutral-0)",
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState
                platform={platform}
                monitorError={monitorError}
                monitorErrorCode={monitorErrorCode}
                onAddProductUrl={() => setUrlDialogOpen(true)}
              />
            )}
          </div>

          <div className="shrink-0 lg:w-48">
            <div className="flex flex-row gap-4 lg:flex-col lg:gap-3">
              <StatItem
                label="Highest seen"
                value={highestSeen !== null ? formatPurchaseCurrency(highestSeen, currency) : "—"}
                icon={<TrendingUp className="size-4 text-neutral-500" />}
              />
              <StatItem
                label="Lowest seen"
                value={lowestSeen !== null ? formatPurchaseCurrency(lowestSeen, currency) : "—"}
                icon={<TrendingDown className="size-4 text-neutral-500" />}
              />
              <StatItem
                label="Current price"
                value={currentPrice !== null ? formatPurchaseCurrency(currentPrice, currency) : "—"}
                icon={<CircleDot className="size-4 text-neutral-500" />}
              />
            </div>
          </div>
        </div>

        <p className="mt-4 text-neutral-500 text-xs">
          {inErrorState ? (
            <>
              Last check failed {errorTimeAgo ?? "recently"} · {platform}
            </>
          ) : timeAgo !== null ? (
            <>
              Updated {timeAgo} · from {platform}
            </>
          ) : (
            <>Waiting for first snapshot from {platform}</>
          )}
        </p>
      </CardContent>
      <AddProductUrlDialog
        purchaseId={purchaseId}
        platform={platform}
        open={urlDialogOpen}
        onOpenChange={setUrlDialogOpen}
        onUpdated={onPurchaseUpdated}
      />
    </Card>
  );
}

function StatItem({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-1 lg:flex-none">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-neutral-500 text-xs">{label}</span>
      </div>
      <span className="font-medium text-neutral-900 text-sm tabular-nums">{value}</span>
    </div>
  );
}
