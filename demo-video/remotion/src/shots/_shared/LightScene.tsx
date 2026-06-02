// SHOT_SPEC §1.5 + §1.8 — light canvas (#F9FAFB) with a subtle cool
// navy halo centered slightly above middle. Grain OFF on light per
// §1.8 (grain on clean product UI reads as dirt).

import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { COLOR, LIGHT } from "./tokens";

interface LightSceneProps {
  children: ReactNode;
  /** Multiply the halo intensity (default 1; 0 = no halo, used during fades). */
  haloIntensity?: number;
  /** Override background color (rare — used in Shot 12 to dim toward #0E141B). */
  background?: string;
  style?: CSSProperties;
}

export const LightScene: React.FC<LightSceneProps> = ({
  children,
  haloIntensity = 1,
  background = COLOR.N50,
  style,
}) => {
  return (
    <AbsoluteFill style={{ background, ...style }}>
      {haloIntensity > 0.001 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: LIGHT.LIGHT_HALO_CSS,
            opacity: haloIntensity,
            pointerEvents: "none",
          }}
          aria-hidden
        />
      )}
      {children}
    </AbsoluteFill>
  );
};
