// PILLAR 1 — LIGHT. Three stacked drop-shadow filters at the same color
// at different blur radii. The recipe is *three* because two reads as a
// glow and four reads as a halation; three is the cinematic bloom.

import type { CSSProperties, ReactNode } from "react";

interface BloomProps {
  children: ReactNode;
  /** Glow color. Pass any CSS color. */
  color?: string;
  /** Intensity multiplier — scales all three layers. 0 disables. */
  intensity?: number;
  style?: CSSProperties;
}

export const Bloom: React.FC<BloomProps> = ({
  children,
  color = "#2D6A4F",
  intensity = 1,
  style,
}) => {
  if (intensity <= 0) {
    return <div style={style}>{children}</div>;
  }
  const filter = [
    `drop-shadow(0 0 ${8 * intensity}px ${color})`,
    `drop-shadow(0 0 ${24 * intensity}px ${colorWithAlpha(color, 0.5)})`,
    `drop-shadow(0 0 ${56 * intensity}px ${colorWithAlpha(color, 0.2)})`,
  ].join(" ");
  return <div style={{ filter, ...style }}>{children}</div>;
};

function colorWithAlpha(color: string, alpha: number): string {
  // Hex (#RRGGBB or #RGB) → rgba()
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const fullHex =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const r = parseInt(fullHex.slice(0, 2), 16);
    const g = parseInt(fullHex.slice(2, 4), 16);
    const b = parseInt(fullHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // hsl(…) → unchanged blend (drop-shadow accepts hsl with no alpha control;
  // fall back to color-mix at the call-site if you need transparency).
  return color;
}
