// Clean (no AppShell) price-history view for Beat07 — mirrors the real
// UiPurchaseDetailWithChart styling (uirefs/_ui Card/Badge/PlatformLogo +
// recharts LineChart) but stripped of the app chrome and driven by frame:
//   • progressive yellow "record" dots (one per auto-check)
//   • a final red "drop" dot + an animated line descent ($599.99 → $499.99)
//   • a prominent current-price readout (fluctuates → settles in the beat)
// The locked uiref is NOT modified — this is a beat-local variant.
import { ArrowDown, CircleDot, TrendingDown, TrendingUp } from "lucide-react";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Badge, Card, CardContent, CardHeader, CardTitle, PlatformLogo } from "../../uirefs/_ui";

const POINTS = ["May 22", "May 24", "May 26", "May 28", "May 30", "May 31"];
const PAID = 599.99;
const DROP = 499.99;
const DROP_INDEX = 5;

export type ChartState = {
  dotsVisible: number; // yellow record dots shown (0..5)
  dotScales: number[]; // pop scale per record dot
  dropP: number; // 0→1 descent of the last point
  dropDotScale: number; // red drop-dot pop (0 = hidden)
  priceText: string; // current-price readout (fluctuates in phase C)
  priceScale: number; // subtle tick-pulse on the readout
  dropped: boolean; // settled drop state (red + badge)
};

const StatItem: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-neutral-500 text-xs">{label}</span>
    </div>
    <span className="font-medium text-neutral-900 text-sm tabular-nums">{value}</span>
  </div>
);

export const PriceChartClean: React.FC<ChartState> = ({
  dotsVisible,
  dotScales,
  dropP,
  dropDotScale,
  priceText,
  priceScale,
  dropped,
}) => {
  const data = POINTS.map((d, i) => ({ d, price: i === DROP_INDEX ? PAID - dropP * (PAID - DROP) : PAID }));

  // biome-ignore lint/suspicious/noExplicitAny: recharts dot render props are untyped
  const renderDot = (p: any) => {
    const { cx, cy, index, key } = p;
    if (cx == null || cy == null) return <circle key={key} r={0} fill="transparent" />;
    if (index < DROP_INDEX) {
      if (index >= dotsVisible) return <circle key={key} cx={cx} cy={cy} r={0} fill="transparent" />;
      const s = dotScales[index] ?? 1;
      return <circle key={key} cx={cx} cy={cy} r={5 * s} fill="#F59E0B" stroke="#FFFFFF" strokeWidth={1.5} />;
    }
    if (dropDotScale <= 0) return <circle key={key} cx={cx} cy={cy} r={0} fill="transparent" />;
    return <circle key={key} cx={cx} cy={cy} r={6 * dropDotScale} fill="#D92626" stroke="#FFFFFF" strokeWidth={2} />;
  };

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1040 }}>
        {/* Product header + prominent current price */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <PlatformLogo platform="costco" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-semibold text-2xl text-neutral-900">Apple iPad Air 11-inch (M2, 128GB, Wi-Fi)</h1>
                <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-100 text-blue-700">
                  {dropped ? "Price dropped" : "Monitoring"}
                </Badge>
              </div>
              <p className="mt-1 text-neutral-500 text-sm">Costco · Retail · Purchased May 22, 2026</p>
            </div>
          </div>

          <div style={{ textAlign: "right", transform: `scale(${priceScale.toFixed(4)})`, transformOrigin: "right center" }}>
            <div className="text-neutral-500 text-xs">Current price</div>
            <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1, color: dropped ? "#D92626" : "#101318", fontVariantNumeric: "tabular-nums" }}>
              {priceText}
            </div>
            {dropped ? (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                <ArrowDown className="size-3" /> $100.00 drop
              </span>
            ) : (
              <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="size-1.5 rounded-full bg-brand-accent-500" /> Checking every 15 min
              </span>
            )}
          </div>
        </div>

        {/* Price-history chart */}
        <Card className="bg-neutral-0">
          <CardHeader>
            <CardTitle className="font-semibold text-lg text-neutral-900">Price history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div className="min-w-0 flex-1">
                <LineChart width={760} height={300} data={data} margin={{ top: 14, right: 64, left: 0, bottom: 0 }}>
                  <XAxis dataKey="d" tick={{ fill: "var(--neutral-500)", fontSize: 13 }} tickLine={false} axisLine={{ stroke: "var(--neutral-200)" }} />
                  <YAxis domain={[479, 615]} tick={{ fill: "var(--neutral-500)", fontSize: 13 }} tickFormatter={(v: number) => `$${v}`} tickLine={false} axisLine={false} width={64} />
                  <ReferenceLine y={PAID} stroke="var(--neutral-200)" strokeDasharray="5 5" label={{ value: "Paid $599.99", fill: "var(--neutral-500)", fontSize: 12, position: "right" }} />
                  <Line type="monotone" dataKey="price" stroke="var(--neutral-500)" strokeWidth={2.5} isAnimationActive={false} dot={renderDot} />
                </LineChart>
              </div>
              <div className="flex w-44 shrink-0 flex-col gap-4 pt-2">
                <StatItem label="Highest seen" value="$599.99" icon={<TrendingUp className="size-4 text-neutral-500" />} />
                <StatItem label="Lowest seen" value={dropped ? "$499.99" : "$599.99"} icon={<TrendingDown className="size-4 text-neutral-500" />} />
                <StatItem label="Checks logged" value={`${dotsVisible + (dropDotScale > 0 ? 1 : 0)}`} icon={<CircleDot className="size-4 text-neutral-500" />} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
