// SHOT_SPEC §1.8 dark canvas: #0A0A0A + directional light from
// top-right (≈78°,18%) + Grain 0.05.
//
// The `lightOpacity` prop drives the directional light's brightness so
// Shot 1's 0.04→0.07 breath, Shot 4's bloom-to-1.0, and the Act-IV
// settling all flow through this single component.

import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { Grain } from "../../polish/Grain";
import { COLOR, LIGHT } from "./tokens";

interface DarkSceneProps {
  children: ReactNode;
  /** Default 0.07 (the storyboard "set" state). Shot 1 ramps from 0.04. */
  lightOpacity?: number;
  /** Hide the directional light entirely (rare — used during cross-fades). */
  noLight?: boolean;
  /** Hide grain (rare — used at the absolute first frame). */
  noGrain?: boolean;
  style?: CSSProperties;
}

export const DarkScene: React.FC<DarkSceneProps> = ({
  children,
  lightOpacity = LIGHT.DARK_LIGHT_DEFAULT_OPACITY,
  noLight = false,
  noGrain = false,
  style,
}) => {
  return (
    <AbsoluteFill style={{ background: COLOR.DARK_BG, ...style }}>
      {children}
      {!noLight && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: LIGHT.DARK_LIGHT_CSS,
            opacity: lightOpacity,
            pointerEvents: "none",
          }}
          aria-hidden
        />
      )}
      {!noGrain && <Grain opacity={LIGHT.GRAIN_DARK_OPACITY} />}
    </AbsoluteFill>
  );
};
