// Scene 2 — The Gap · 0:12–0:30 · 1080f · light.
// The problem at scale: protection exists, almost no one claims it,
// and $10B+ goes unclaimed every year. Big amber count-up is the beat.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { S2_GAP_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

export const Scene02Gap: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.012} startF={0} endF={S2_GAP_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  const lineAOp = interpolate(frame, [10, 46], [0, 1], clamp);
  const lineAY = interpolate(frame, [10, 46], [18, 0], clamp);

  // Big count-up to $10B+
  const countT = interpolate(frame, [90, 340], [0, 10], clamp);
  const bigOp = interpolate(frame, [90, 130], [0, 1], clamp);
  const bigScale = interpolate(frame, [90, 140], [0.92, 1], clamp);

  const labelOp = interpolate(frame, [300, 340], [0, 1], clamp);

  const lineBOp = interpolate(frame, [560, 600], [0, 1], clamp);
  const lineBY = interpolate(frame, [560, 600], [16, 0], clamp);

  const footOp = interpolate(frame, [640, 690], [0, 1], clamp);
  const outOp = interpolate(frame, [S2_GAP_F - 40, S2_GAP_F], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ opacity: outOp }}>
      {/* Top line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 250,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          fontSize: 46,
          color: COLOR.INK,
          opacity: lineAOp,
          transform: `translateY(${lineAY}px)`,
        }}
      >
        Most big retailers will refund a price drop.
      </div>

      {/* Big amber count-up */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 540 - 90,
          textAlign: "center",
          ...TYPE.STAT,
          color: COLOR.AMBER,
          opacity: bigOp,
          transform: `scale(${bigScale.toFixed(4)})`,
        }}
      >
        {`$${Math.round(countT)}B+`}
      </div>

      {/* Label under the number */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 700,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 30,
          color: COLOR.BODY,
          opacity: labelOp,
        }}
      >
        left unclaimed by shoppers every year.
      </div>

      {/* Contrast line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 778,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          fontSize: 38,
          color: COLOR.INK,
          opacity: lineBOp,
          transform: `translateY(${lineBY}px)`,
        }}
      >
        Almost no one ever claims it.
      </div>

      {/* Footnote */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1000,
          textAlign: "center",
          ...TYPE.FOOTNOTE,
          opacity: footOp * 0.6,
        }}
      >
        Industry estimates of unclaimed price-protection refunds, U.S.
      </div>
    </AbsoluteFill>
  );
};
