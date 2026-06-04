// Clean (no AppShell) price-monitoring view for Beat07. Custom SVG timeline
// (not recharts) so the record dots can be EQUALLY SPACED at (i+0.5)/N at every
// moment and migrate smoothly as new checks arrive. Styling mirrors the real
// UiPurchaseDetailWithChart (uirefs/_ui Card/Badge/PlatformLogo); the locked
// uiref is NOT modified. Animation state is computed in Beat07 and passed in.
import { ArrowDown, CircleDot, TrendingDown, TrendingUp } from "lucide-react";

import { Badge, Card, CardContent, CardHeader, CardTitle, PlatformLogo } from "../../uirefs/_ui";

const BRAND_BLUE = "#27466E"; // colors.brand.primary — same blue as the ClaimIt logo
const YELLOW = "#F59E0B";
const RED = "#D92626";

// SVG plot geometry.
const SVG_W = 760;
const SVG_H = 300;
const PLOT_X = 70;
const PLOT_W = 638;
const PLOT_TOP = 32;
const PLOT_BOTTOM = 244;
const Y_MIN = 479;
const Y_MAX = 615;
const PAID = 599.99;

const yFor = (price: number) => PLOT_BOTTOM - ((price - Y_MIN) / (Y_MAX - Y_MIN)) * (PLOT_BOTTOM - PLOT_TOP);
const xFor = (f: number) => PLOT_X + f * PLOT_W;

export type Dot = { xFrac: number; price: number; scale: number; isDrop: boolean };

export type ChartState = {
  dots: Dot[]; // visible dots only (already migrated/positioned)
  checksLogged: number;
  priceText: string;
  priceScale: number;
  dropped: boolean;
  toastP: number; // 0→1 drop-toast reveal
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

export const PriceChartClean: React.FC<ChartState> = ({ dots, checksLogged, priceText, priceScale, dropped, toastP }) => {
  const flatY = yFor(PAID);
  const linePath = dots.map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(d.xFrac).toFixed(1)},${yFor(d.price).toFixed(1)}`).join(" ");

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1040, position: "relative" }}>
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
            <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1, color: dropped ? RED : "#101318", fontVariantNumeric: "tabular-nums" }}>
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

        {/* Price-history timeline (custom SVG) */}
        <Card className="bg-neutral-0">
          <CardHeader>
            <CardTitle className="font-semibold text-lg text-neutral-900">Price history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div className="min-w-0 flex-1">
                <svg width={SVG_W} height={SVG_H} style={{ overflow: "visible" }} aria-hidden>
                  {/* Y reference levels */}
                  {[PAID, 499.99].map((p) => (
                    <text key={p} x={PLOT_X - 12} y={yFor(p) + 4} textAnchor="end" fill="#6B7280" fontSize={12}>
                      {`$${p.toFixed(0)}`}
                    </text>
                  ))}
                  {/* X baseline */}
                  <line x1={PLOT_X} y1={PLOT_BOTTOM} x2={PLOT_X + PLOT_W} y2={PLOT_BOTTOM} stroke="#E2E6EB" strokeWidth={1} />
                  {/* Paid reference */}
                  <line x1={PLOT_X} y1={flatY} x2={PLOT_X + PLOT_W} y2={flatY} stroke="#C5CAD3" strokeWidth={1} strokeDasharray="5 5" />
                  <text x={PLOT_X + PLOT_W + 6} y={flatY + 4} fill="#6B7280" fontSize={12}>
                    Paid $599.99
                  </text>
                  {/* Connecting line */}
                  {dots.length >= 2 ? <path d={linePath} fill="none" stroke="#6B7280" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
                  {/* Dots */}
                  {dots.map((d, i) => (
                    <circle
                      key={i}
                      cx={xFor(d.xFrac)}
                      cy={yFor(d.price)}
                      r={(d.isDrop ? 7 : 6) * d.scale}
                      fill={d.isDrop ? RED : YELLOW}
                      stroke="#FFFFFF"
                      strokeWidth={d.isDrop ? 2.5 : 1.5}
                    />
                  ))}
                </svg>
              </div>
              <div className="flex w-44 shrink-0 flex-col gap-4 pt-2">
                <StatItem label="Highest seen" value="$599.99" icon={<TrendingUp className="size-4 text-neutral-500" />} />
                <StatItem label="Lowest seen" value={dropped ? "$499.99" : "$599.99"} icon={<TrendingDown className="size-4 text-neutral-500" />} />
                <StatItem label="Checks logged" value={`${checksLogged}`} icon={<CircleDot className="size-4 text-neutral-500" />} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Drop notification toast — iOS-push feel, lower-center over the chart */}
        {toastP > 0.01 ? (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 36, display: "flex", justifyContent: "center", opacity: toastP, transform: `translateY(${((1 - toastP) * 20).toFixed(1)}px)`, pointerEvents: "none" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 20px", borderRadius: 16, background: BRAND_BLUE, color: "#FFFFFF", boxShadow: "0 16px 40px rgba(15,23,42,0.28)", fontFamily: '"Inter", system-ui, sans-serif' }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, background: "rgba(255,255,255,0.16)" }}>
                <TrendingDown className="size-4" color="#FFFFFF" />
              </span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Price dropped — $100 off at Costco</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
