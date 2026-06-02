// SHOT 05 — What ClaimIt is · 0:28–0:36 · 480 f · Act II · Light
// Two clean lines on light bg. Imperceptible push-in 1.000→1.010.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../_shared/Camera";
import { DP4_ONE_LINER } from "../_shared/data";
import { LightScene } from "../_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

export const Shot05: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.01} startF={0} endF={480}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  const lineAOpacity = interpolate(frame, [0, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const lineAY = interpolate(frame, [0, 36], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  const lineBOpacity = interpolate(frame, [60, 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const lineBY = interpolate(frame, [60, 96], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Navy fade-in on "prepares the claim" f96–120
  const navyT = interpolate(frame, [96, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  // body color -> navy crossfade. Interpolate channels INK→NAVY.
  // INK #101318 = (16, 19, 24); NAVY #27466E = (39, 70, 110)
  const navyR = Math.round(16 + (39 - 16) * navyT);
  const navyG = Math.round(19 + (70 - 19) * navyT);
  const navyB = Math.round(24 + (110 - 24) * navyT);
  const navyColor = `rgb(${navyR}, ${navyG}, ${navyB})`;

  // Out fade f440–480
  const outOpacity = interpolate(frame, [440, 480], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return (
    <AbsoluteFill style={{ opacity: outOpacity }}>
      {/* Line A */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 480 - 28,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          color: COLOR.INK,
          opacity: lineAOpacity,
          transform: `translateY(${lineAY}px)`,
        }}
      >
        {DP4_ONE_LINER.lineA}
      </div>
      {/* Line B */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 560 - 28,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          color: COLOR.INK,
          opacity: lineBOpacity,
          transform: `translateY(${lineBY}px)`,
        }}
      >
        {DP4_ONE_LINER.lineB_prefix}
        <span style={{ color: navyColor }}>{DP4_ONE_LINER.lineB_navy}</span>
        {DP4_ONE_LINER.lineB_suffix}
      </div>
    </AbsoluteFill>
  );
};
