// PILLAR 1 — LIGHT. Volumetric light beam — a soft radial gradient from
// a defined origin, falling off into transparency. Used in the opening
// (light splitting the dark), the Section ⑤ Cut, and the Section ⑧
// Close (resolved chord moment).

import type { CSSProperties } from "react";

interface LightBeamProps {
  /** Beam origin as percentage of frame (default top-center). */
  originX?: string;
  originY?: string;
  /** Beam radius along x/y (px) — control the "shape" of the beam. */
  radiusX?: number;
  radiusY?: number;
  /** Peak opacity at the origin. Default 0.22. */
  intensity?: number;
  /** Color of the beam. Default warm white. */
  color?: string;
  style?: CSSProperties;
}

export const LightBeam: React.FC<LightBeamProps> = ({
  originX = "50%",
  originY = "0%",
  radiusX = 800,
  radiusY = 1200,
  intensity = 0.22,
  color = "rgba(255, 250, 235, 1)",
  style,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(ellipse ${radiusX}px ${radiusY}px at ${originX} ${originY}, ${color.replace(
          /, ?1\)/,
          `, ${intensity})`,
        )}, transparent 60%)`,
        mixBlendMode: "screen",
        ...style,
      }}
      aria-hidden
    />
  );
};
