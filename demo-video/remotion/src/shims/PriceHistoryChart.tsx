// PriceHistoryChart — SVG line chart of price over time. `drawProgress`
// drives the line draw-on (stroke-dashoffset); `showDrop` adds the red
// drop annotation. Defaults to the Costco iPad fixture ($599.99 → $499.99).
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

interface Point {
  label: string;
  price: number;
}
const DEFAULT: Point[] = [
  { label: "Day 1", price: 599.99 },
  { label: "Day 3", price: 599.99 },
  { label: "Day 5", price: 599.99 },
  { label: "Day 7", price: 599.99 },
  { label: "Day 9", price: 499.99 },
];

export const PriceHistoryChart: React.FC<{
  points?: Point[];
  drawProgress?: number;
  showDrop?: boolean;
  style?: CSSProperties;
}> = ({ points = DEFAULT, drawProgress = 1, showDrop = false, style }) => {
  const W = 560;
  const H = 300;
  const padX = 64;
  const padY = 54;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - 2 * padX);
  const y = (price: number) => padY + (1 - (price - min) / range) * (H - 2 * padY);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`)
    .join(" ");
  const dropIdx = points.length - 1;

  return (
    <div
      style={{
        width: W,
        backgroundColor: colors.bg.surface,
        borderRadius: 14,
        border: "1px solid rgba(15,20,25,0.08)",
        boxShadow: "0 8px 24px rgba(15,20,25,0.06)",
        padding: 24,
        fontFamily: FONT_STACK_TEXT,
        ...style,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.muted, marginBottom: 8 }}>
        Apple iPad Air 11&quot; M2 · price watch
      </div>
      <svg aria-hidden="true" width={W - 48} height={H} viewBox={`0 0 ${W} ${H}`}>
        <line
          x1={padX}
          y1={H - padY}
          x2={W - padX}
          y2={H - padY}
          stroke="rgba(15,20,25,0.12)"
          strokeWidth={1}
        />
        <path
          d={path}
          fill="none"
          stroke={colors.brand.primary}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawProgress}
        />
        {showDrop && (
          <>
            <circle
              cx={x(dropIdx)}
              cy={y(points[dropIdx].price)}
              r={7}
              fill={colors.semantic.danger}
            />
            <text
              x={x(dropIdx)}
              y={y(points[dropIdx].price) - 16}
              fontSize={16}
              fontWeight={700}
              fill={colors.semantic.danger}
              textAnchor="middle"
              fontFamily={FONT_STACK_TEXT}
            >
              $499.99
            </text>
          </>
        )}
        {points.map((p, i) => (
          <text
            key={p.label}
            x={x(i)}
            y={H - padY + 22}
            fontSize={11}
            fill={colors.text.muted}
            textAnchor="middle"
            fontFamily={FONT_STACK_TEXT}
          >
            {p.label}
          </text>
        ))}
        <text
          x={padX}
          y={y(max) - 10}
          fontSize={11}
          fill={colors.text.muted}
          fontFamily={FONT_STACK_TEXT}
        >
          $599.99
        </text>
      </svg>
    </div>
  );
};
