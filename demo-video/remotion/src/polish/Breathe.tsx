// PILLAR 4 — CAMERA. The wrapper that makes sure nothing is ever 100%
// static. Wraps every section root with an imperceptible perpetual
// motion.
//
// JITTER FIX (post-draft review): the previous implementation animated
// scale continuously, which re-rasterizes every text glyph every frame
// and reads as a "shimmer" — exactly the flicker we're trying to
// avoid. The new implementation:
//   - drops the continuous scale wobble (causes text shimmer)
//   - rounds translateY to whole pixels (sub-pixel translation also
//     shimmers, especially through CSS filters)
//   - keeps a very tiny y drift (±1px max at intensity=1) so the frame
//     still "breathes" without re-rasterising text
//
// If a specific scene wants the explicit scale-breath (hero typography),
// it can pass `allowScale` to opt in.

import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface BreatheProps {
  children: ReactNode;
  /** 1 = default (near-imperceptible). 0 disables. */
  intensity?: number;
  /** Override the wobble period (seconds). Default 6s. */
  periodSec?: number;
  /** Opt in to scale wobble. Off by default to avoid text shimmer. */
  allowScale?: boolean;
  style?: CSSProperties;
}

export const Breathe: React.FC<BreatheProps> = ({
  children,
  intensity = 1,
  periodSec = 6,
  allowScale = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (intensity <= 0) {
    return <div style={{ width: "100%", height: "100%", ...style }}>{children}</div>;
  }

  const t = frame / fps;
  const driftPhase = (t / periodSec) * Math.PI * 2;

  // Whole-pixel y drift only. Max 1px at intensity=1, scales linearly.
  // Snapping to integer pixels stops sub-pixel shimmer through grain +
  // vignette filters.
  const tyRaw = Math.sin(driftPhase) * intensity;
  const ty = Math.round(tyRaw);

  // Scale opt-in only. When enabled, scale steps in 0.002 (0.2%)
  // increments — small enough to feel like a breath, big enough to be
  // a frame-coherent step (no shimmer between sub-step rasterizations).
  let scale = 1;
  if (allowScale) {
    const scalePhase = (t / (periodSec * 1.1)) * Math.PI * 2;
    scale = 1 + Math.round(Math.sin(scalePhase) * 2 * intensity) * 0.002;
  }

  if (ty === 0 && scale === 1) {
    return <div style={{ width: "100%", height: "100%", ...style }}>{children}</div>;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `translateY(${ty}px)${allowScale ? ` scale(${scale.toFixed(4)})` : ""}`,
        transformOrigin: "center center",
        willChange: "transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
