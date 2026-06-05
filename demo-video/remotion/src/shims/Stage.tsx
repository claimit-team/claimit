// Stage — shared "settle" wrapper for Refund-demo beats: centers content and
// eases it in (scale 0.98→1 + opacity 0→1 over the first 8 frames) so beats
// don't hard-cut. Subtitles/audio sit OUTSIDE this (added by each beat).
import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { easings } from "../polish/easings";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const Stage: React.FC<{ children: ReactNode; align?: "center" | "top" }> = ({
  children,
  align = "center",
}) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, 8], [0.98, 1], { ...C, easing: easings.easeOut });
  const o = interpolate(frame, [0, 8], [0, 1], C);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
        paddingTop: align === "top" ? 110 : 0,
        opacity: o,
        transform: `scale(${s.toFixed(4)})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
