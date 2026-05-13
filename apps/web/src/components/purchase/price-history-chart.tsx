"use client";

import { CircleDot, TrendingDown, TrendingUp } from "lucide-react";
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
} from "@/lib/mock-purchases";

interface PriceHistoryChartProps {
  priceHistory: PriceHistoryPointVm[];
  pricePaid: number;
  currency: string;
  currentPrice: number;
  lowestSeen: number;
  highestSeen: number;
  lastChecked: string;
  platform: string;
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: PriceHistoryPointVm;
}

function CustomDot({ cx, cy, payload }: CustomDotProps) {
  if (!payload?.dropDetected) return null;
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
  const chartData = priceHistory.map((point) => ({
    ...point,
    formattedDate: formatPurchaseShortDate(point.date),
  }));

  const minPrice = Math.min(...priceHistory.map((p) => p.price));
  const maxPrice = Math.max(...priceHistory.map((p) => p.price));
  const padding = (maxPrice - minPrice) * 0.1 || 10;
  const yMin = Math.floor(minPrice - padding);
  const yMax = Math.ceil(maxPrice + padding);

  const timeAgo = getPurchaseRelativeTime(lastChecked);

  return (
    <Card className="bg-neutral-0">
      <CardHeader>
        <CardTitle className="font-semibold text-lg text-neutral-900">Price history</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
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
                  dot={<CustomDot />}
                  activeDot={{
                    r: 4,
                    fill: "var(--neutral-500)",
                    stroke: "var(--neutral-0)",
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="shrink-0 lg:w-48">
            <div className="flex flex-row gap-4 lg:flex-col lg:gap-3">
              <StatItem
                label="Highest seen"
                value={formatPurchaseCurrency(highestSeen, currency)}
                icon={<TrendingUp className="size-4 text-neutral-500" />}
              />
              <StatItem
                label="Lowest seen"
                value={formatPurchaseCurrency(lowestSeen, currency)}
                icon={<TrendingDown className="size-4 text-neutral-500" />}
              />
              <StatItem
                label="Current price"
                value={formatPurchaseCurrency(currentPrice, currency)}
                icon={<CircleDot className="size-4 text-neutral-500" />}
              />
            </div>
          </div>
        </div>

        <p className="mt-4 text-neutral-500 text-xs">
          Updated {timeAgo} · from {platform}
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
