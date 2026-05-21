"use client";

import { CircleDot, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatPurchaseCurrency,
  formatPurchaseShortDate,
  getPurchaseRelativeTime,
  type PriceHistoryPointVm,
} from "@/lib/purchase-detail-view";

interface PriceHistoryChartProps {
  priceHistory: PriceHistoryPointVm[];
  pricePaid: number;
  currency: string;
  currentPrice: number | null;
  lowestSeen: number | null;
  highestSeen: number | null;
  lastChecked: string | null;
  platform: string;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: PriceHistoryPointVm;
  pricePaid: number;
}

/**
 * Custom dot: amber for any below-paid point, but the orientation of
 * the dot doesn't carry the "first drop" semantics — the
 * `dropDetected` flag on the point does (set only on the first
 * below-paid point by `buildPriceSeries`). Both this dot and the
 * tooltip respect the flag for the label; the visual amber tint applies
 * to ALL below-paid points so the chart still tells the "current price
 * is under what you paid" story at a glance.
 */
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
      {/* Drop label is ONLY on the first below-paid point (decision 6).
          Other below-paid points stay amber-styled but unlabeled so
          the chart reads as a single drop story rather than a series
          of warnings. */}
      {point.dropDetected && (
        <p className="mt-1 font-medium text-semantic-warning text-xs">Drop detected</p>
      )}
    </div>
  );
}

/**
 * Calm empty state for purchases with zero plottable snapshots.
 *
 * Real freshly-monitored purchases routinely have 0-1 snapshots — the
 * monitor cron sweep hasn't run yet, OR has run but the adapter didn't
 * return data, OR all rows have a non-matching tier price. None of
 * those are errors; the user should see a steady "tracking, no
 * snapshots yet" affordance rather than a broken/blank chart frame.
 * (Decision 5 in the review.)
 */
function ChartEmptyState({ platform }: { platform: string }) {
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
  priceHistory,
  pricePaid,
  currency,
  currentPrice,
  lowestSeen,
  highestSeen,
  lastChecked,
  platform,
}: PriceHistoryChartProps) {
  const hasData = priceHistory.length > 0;

  // Recharts needs a non-empty domain to render. When `priceHistory` is
  // empty we render the calm empty state instead of forcing the
  // LineChart to draw a single padded point.
  const chartData = priceHistory.map((point) => ({
    ...point,
    formattedDate: formatPurchaseShortDate(point.date),
  }));

  // Compute y-axis bounds only when we have data; otherwise these
  // values are unused (the empty-state branch returns early). Includes
  // `pricePaid` in the min/max so the dashed ReferenceLine never
  // falls outside the visible range.
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
              <ResponsiveContainer width="100%" height={280} className="max-md:!h-[200px]">
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
              <ChartEmptyState platform={platform} />
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
          {timeAgo !== null ? (
            <>
              Updated {timeAgo} · from {platform}
            </>
          ) : (
            <>Waiting for first snapshot from {platform}</>
          )}
        </p>
      </CardContent>
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
