// PILLAR 3 — MATERIAL. Film-grain overlay. Applied once at root for
// assembled films; sections still call <Grain /> internally for solo
// rendering, but those calls are suppressed by a context so the root
// grain isn't doubled up.

import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";

interface GrainContextValue {
  isRoot: boolean;
}
const GrainContext = createContext<GrainContextValue>({ isRoot: false });

interface GrainProps {
  /** 0.04–0.09 typical. Higher on dark backgrounds. */
  opacity?: number;
  /** "overlay" (default) | "soft-light" | "color-burn" */
  blendMode?: "overlay" | "soft-light" | "color-burn" | "multiply";
  /** Marks this Grain as the root-level wrapper. Inner Grain calls no-op. */
  isRoot?: boolean;
}

export const Grain: React.FC<GrainProps> = ({ opacity = 0.06, blendMode = "overlay", isRoot }) => {
  const ctx = useContext(GrainContext);
  const frame = useCurrentFrame();
  // If a root Grain is already active and this isn't it, no-op.
  if (ctx.isRoot && !isRoot) {
    return null;
  }
  // If this is the root grain, register it for the rest of the tree.
  const grain = (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity,
        mixBlendMode: blendMode,
        zIndex: 9999,
      }}
      aria-hidden
    >
      <title>Film grain overlay</title>
      <filter id={`grain-${frame}`}>
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves={2}
          seed={frame % 256}
          stitchTiles="stitch"
        />
        <feColorMatrix
          values="0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 1 0"
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#grain-${frame})`} />
    </svg>
  );
  if (isRoot) {
    return <GrainContext.Provider value={{ isRoot: true }}>{grain}</GrainContext.Provider>;
  }
  return grain;
};

/**
 * Wraps children in a context that suppresses inner Grain calls. Use
 * at the root composition when you've already painted Grain at the
 * outermost layer.
 */
export const GrainSuppressor: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <GrainContext.Provider value={{ isRoot: true }}>{children}</GrainContext.Provider>
);
