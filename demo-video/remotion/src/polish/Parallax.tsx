// PILLAR 2 — DEPTH. Layered parallax — drifts wrapped children at a
// fraction of frame motion. Used for the floating supporting elements
// in Sections ② and ③, and as the depth bed for ① Opening.
//
// JITTER FIX: rounds translate values to whole pixels. Sub-pixel
// translation through CSS filters (blur, grain, vignette) shimmers in
// the rendered frames.

import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface ParallaxProps {
  children: ReactNode;
  /** 1 = matches frame motion. <1 = slower (further back). >1 = faster (closer). */
  depth?: number;
  /** Path of the parallax drift in seconds — full cycle. Default 16. */
  periodSec?: number;
  /** Amplitude px. Default 12. */
  amplitudeX?: number;
  amplitudeY?: number;
  /** Phase offset in radians. Use to desync layers. */
  phase?: number;
  /** Additional CSS filters (commonly used to blur background layers). */
  blurPx?: number;
  opacity?: number;
  style?: CSSProperties;
}

export const Parallax: React.FC<ParallaxProps> = ({
  children,
  depth = 0.3,
  periodSec = 16,
  amplitudeX = 12,
  amplitudeY = 8,
  phase = 0,
  blurPx = 0,
  opacity = 1,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps / periodSec;
  // Round to whole pixels — sub-pixel translate shimmers.
  const x = Math.round(Math.sin(t * Math.PI * 2 + phase) * amplitudeX * depth);
  const y = Math.round(Math.cos(t * Math.PI * 2 + phase * 0.7) * amplitudeY * depth);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate(${x}px, ${y}px)`,
        filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
        opacity,
        willChange: "transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
