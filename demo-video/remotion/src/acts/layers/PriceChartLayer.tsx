// PriceChartLayer — Shot 6's mounted chart. Real Recharts <LineChart>
// styled per CC_AUDIT, with an overlay SVG <path> that traces the same
// line for the stroke-dasharray reveal (fallback B from the plan —
// safer for headless rendering than per-frame Recharts DOM mutation).

import { Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import type { PriceHistoryPointVm } from "@/lib/purchase-detail-view";

import { COLOR, TYPE, WINDOW } from "../../shots/_shared/tokens";

interface Props {
  header: string;
  caption: string;
  series: PriceHistoryPointVm[];
  pricePaid: number;
  revealProgress: number; // 0..1
  amberDotsVisible: number;
  refLineOpacity: number;
  finalLabelOpacity: number;
  captionOpacity: number;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtShortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
};

export const PriceChartLayer: React.FC<Props> = ({
  header,
  caption,
  series,
  pricePaid,
  revealProgress,
  amberDotsVisible,
  refLineOpacity,
  finalLabelOpacity,
  captionOpacity,
}) => {
  const data = series.map((p) => ({
    ...p,
    formattedDate: fmtShortDate(p.date),
  }));

  // Compute y domain
  const prices = series.map((p) => p.price);
  const yMin = Math.floor(Math.min(...prices, pricePaid) - 10);
  const yMax = Math.ceil(Math.max(...prices, pricePaid) + 10);

  // Chart canvas dimensions (inside the native 1664×1016 window).
  // BUG-3: width reduced 1480→1380 so the right-edge gutter (100 px)
  // accommodates the ReferenceLine label and the monitor caption chip
  // without clipping. The outer container's PAD_X=80 keeps centering.
  const CHART_W = 1380;
  const CHART_H = 760;
  const PAD_X = 80;
  const HEADER_H = 120;

  // Compute overlay polyline coordinates in chart-canvas pixels.
  // X: evenly spaced from left margin to right margin.
  // Y: linearly interpolated from yMin..yMax.
  const innerX0 = 60;
  const innerX1 = CHART_W - 60;
  const innerY0 = 40;
  const innerY1 = CHART_H - 60;

  const yToPx = (y: number) => innerY1 - ((y - yMin) / (yMax - yMin)) * (innerY1 - innerY0);

  const pts = series.map((p, i) => {
    const x = innerX0 + (i / (series.length - 1)) * (innerX1 - innerX0);
    const y = yToPx(p.price);
    return { x, y };
  });
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  // For stroke-dasharray reveal we need the path's total length. We
  // approximate using Euclidean sum (cheap, deterministic).
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }
  const dashOffset = totalLen * (1 - revealProgress);

  // Amber dots: only for price < paid.
  const amberDotIndices = series
    .map((p, i) => (p.price < pricePaid ? i : -1))
    .filter((i) => i !== -1);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: COLOR.WHITE,
        borderRadius: WINDOW.RADIUS,
        padding: PAD_X,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: HEADER_H,
          display: "flex",
          alignItems: "center",
          ...TYPE.HEADLINE,
          color: COLOR.INK,
        }}
      >
        {header}
      </div>

      {/* Chart canvas */}
      <div style={{ position: "relative", width: CHART_W, height: CHART_H }}>
        {/* Real Recharts chart (line invisible — overlay handles the reveal) */}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 40, right: 60, left: 0, bottom: 60 }}>
            <XAxis
              dataKey="formattedDate"
              tick={{ fill: COLOR.MUTE, fontSize: 14 }}
              tickLine={false}
              axisLine={{ stroke: COLOR.LINE }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: COLOR.MUTE, fontSize: 14 }}
              tickFormatter={(v) => `$${v}`}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            <ReferenceLine
              y={pricePaid}
              stroke={COLOR.LINE}
              strokeDasharray="5 5"
              opacity={refLineOpacity}
              label={{
                value: `Paid ${fmtMoney(pricePaid)}`,
                fill: COLOR.MUTE,
                fontSize: 13,
                // BUG-3: was "right" (outside chart, clipped).
                // "insideTopRight" anchors the label inside the chart.
                position: "insideTopRight",
                opacity: refLineOpacity,
              }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="transparent"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Overlay SVG — line reveal + amber dots + final-price label */}
        <svg
          width={CHART_W}
          height={CHART_H}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <title>Price history line and amber drop markers</title>
          <path
            d={pathD}
            stroke={COLOR.MUTE}
            strokeWidth={2}
            fill="none"
            strokeDasharray={totalLen}
            strokeDashoffset={dashOffset}
          />
          {amberDotIndices.slice(0, amberDotsVisible).map((idx) => {
            const p = pts[idx];
            return <circle key={idx} cx={p.x} cy={p.y} r={6} fill={COLOR.AMBER} />;
          })}
          {/* Final label at last point */}
          {finalLabelOpacity > 0 && (
            <g opacity={finalLabelOpacity}>
              <text
                x={pts[pts.length - 1].x + 14}
                y={pts[pts.length - 1].y + 4}
                fill={COLOR.INK}
                fontSize={18}
                fontWeight={600}
              >
                {fmtMoney(series[series.length - 1].price)}
              </text>
            </g>
          )}
        </svg>

        {/* Monitor caption chip — above the last point.
            BUG-3: right-anchored within the chart canvas so the full
            "Price drop detected by ClaimIt monitor-agent" string is
            never clipped. The chip's right edge clamps to
            CHART_W - 8 px; the chip extends LEFT from there. */}
        {captionOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              right: 8,
              top: pts[pts.length - 1].y - 56,
              padding: "8px 14px",
              background: COLOR.WHITE,
              border: `1px solid ${COLOR.LINE}`,
              borderRadius: 999,
              ...TYPE.MICRO,
              color: COLOR.MUTE,
              opacity: captionOpacity,
              boxShadow: "0 2px 6px rgba(20,30,50,0.08)",
              whiteSpace: "nowrap",
            }}
          >
            {caption}
          </div>
        )}
      </div>
    </div>
  );
};
