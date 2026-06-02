// PILLAR 2/4 — DEPTH + CAMERA. Rack-focus helper. Wraps any element so
// it can be rendered "in focus" or "out of focus" at a given frame, with
// blur + saturation drift handling the falloff. Used in:
//
//   - Section 6.1: Gmail inbox emails are out of focus until the new
//     email arrives, then focus racks to it.
//   - Section 6.6: when the camera zooms to the Assistant pane, the
//     other panes go out of focus.

import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { EASING } from "./tokens";

interface RackFocusProps {
  children: ReactNode;
  /** Focus value at the given frame: 1 = sharp, 0 = soft background. */
  focus: number;
  /**
   * If provided, animates focus from its current value to `focus` over
   * `rampFrames` frames starting at `rampStart`.
   */
  rampStart?: number;
  rampFrames?: number;
  rampFrom?: number;
  /** Override blur amount (px). Default 8 at focus=0. */
  maxBlurPx?: number;
  /** Override saturation drop. Default 0.55 at focus=0. */
  minSaturation?: number;
  /**
   * Lower bound for opacity at focus=0. Default 0.7 (legacy sections).
   * SHOT_SPEC §1.7 requires 0.15 — shots pass `dimOpacity={0.15}`.
   * At focus=1 we always return 1; this prop only affects the
   * out-of-focus floor.
   */
  dimOpacity?: number;
  style?: CSSProperties;
}

export const RackFocus: React.FC<RackFocusProps> = ({
  children,
  focus,
  rampStart,
  rampFrames = 18,
  rampFrom,
  maxBlurPx = 8,
  minSaturation = 0.55,
  dimOpacity = 0.7,
  style,
}) => {
  const frame = useCurrentFrame();
  let currentFocus = focus;
  if (rampStart !== undefined && rampFrom !== undefined) {
    currentFocus = interpolate(frame, [rampStart, rampStart + rampFrames], [rampFrom, focus], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: (t) => bezier(t, EASING.smooth),
    });
  }
  const blur = (1 - currentFocus) * maxBlurPx;
  const saturate = minSaturation + currentFocus * (1 - minSaturation);
  const opacity = dimOpacity + currentFocus * (1 - dimOpacity);
  return (
    <div
      style={{
        filter: `blur(${blur.toFixed(2)}px) saturate(${saturate.toFixed(2)})`,
        opacity,
        willChange: "filter, opacity",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

function bezier(t: number, [_x1, y1, _x2, y2]: readonly [number, number, number, number]): number {
  const it = 1 - t;
  return 3 * it * it * t * y1 + 3 * it * t * t * y2 + t * t * t;
}
