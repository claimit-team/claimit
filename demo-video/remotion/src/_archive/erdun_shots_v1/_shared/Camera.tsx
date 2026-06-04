// SHOT_SPEC §1.6 — scale-only camera wrapper.
//
// One dedicated wrapper that ONLY does `transform: scale(N)` with
// N piped through .toFixed(5). No translate, no filter, no opacity on
// this element. Per CC_AUDIT this prevents the Breathe-style glyph
// re-rasterization jitter. transformOrigin: center center.

import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { EASE_CAM } from "./tokens";

interface CameraProps {
  children: ReactNode;
  /** Static scale value (overrides any range). */
  scale?: number;
  /** Optional animated scale: from/to over [startF, endF]. */
  from?: number;
  to?: number;
  startF?: number;
  endF?: number;
  /** Override easing. Default EASE_CAM. */
  easing?: (t: number) => number;
  style?: CSSProperties;
}

export const Camera: React.FC<CameraProps> = ({
  children,
  scale,
  from,
  to,
  startF,
  endF,
  easing = EASE_CAM,
  style,
}) => {
  const frame = useCurrentFrame();
  let value = scale ?? 1;
  if (from !== undefined && to !== undefined && startF !== undefined && endF !== undefined) {
    value = interpolate(frame, [startF, endF], [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing,
    });
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${value.toFixed(5)})`,
        transformOrigin: "center center",
        willChange: "transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Helper for shots that compute their own scale value (e.g., chained
 * push-in across Shots 7 and 8). Returns the toFixed(5) string ready
 * to plug into a transform.
 */
export function cameraScaleString(value: number): string {
  return `scale(${value.toFixed(5)})`;
}
