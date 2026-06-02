// SHOT_SPEC §1.5 — the floating product window.
//
// Outer container is positioned absolutely on the 1920×1080 canvas at
// the WINDOW bounds. The shell shadow + 14 px radius + overflow:hidden
// give the "float." A static scale(0.92) is the WINDOW_FIT — applied
// here on the OUTER element so the camera wrapper (parent) only does
// scale-only push-in on TOP of this fit.
//
// Stage's children are absolute-inset siblings rendered via
// <Stage.Layer>. All Stage swaps happen by interpolating Layer
// opacity. No <Sequence>, no key changes — those would remount the
// inner ClaimDetailShell and reflow it (capability-audit rule).

import type { CSSProperties, ReactNode } from "react";
import { WINDOW } from "./tokens";

interface StageProps {
  children: ReactNode;
  style?: CSSProperties;
}

export const Stage: React.FC<StageProps> & {
  Layer: typeof StageLayer;
} = ({ children, style }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: WINDOW.BOUNDS_X_MIN,
        top: WINDOW.BOUNDS_Y_MIN,
        width: WINDOW.FIT_W,
        height: WINDOW.FIT_H,
        borderRadius: WINDOW.RADIUS,
        overflow: "hidden",
        boxShadow: WINDOW.SHADOW,
        background: "transparent",
        ...style,
      }}
    >
      {/* Inner reset wrapper at NATIVE dimensions, scaled to FIT.
          The shell measures its own panels at NATIVE_W × NATIVE_H
          (= 1664×1016), then the visual is downscaled to ~1531×935.
          react-resizable-panels' layout math runs on native pixels, so
          the panels do NOT reflow when we change FIT. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: WINDOW.NATIVE_W,
          height: WINDOW.NATIVE_H,
          transform: `scale(${WINDOW.FIT})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
};

interface LayerProps {
  children: ReactNode;
  opacity: number;
  /** Optional pointer-events override (rare). */
  pointerEvents?: "none" | "auto";
  style?: CSSProperties;
}

const StageLayer: React.FC<LayerProps> = ({ children, opacity, pointerEvents = "none", style }) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        pointerEvents,
        willChange: "opacity",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

Stage.Layer = StageLayer;
