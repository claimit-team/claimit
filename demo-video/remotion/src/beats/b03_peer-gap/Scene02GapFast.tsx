// Scene 2 — The Gap · 0:12–0:30 · 1080f · light.
// The problem at scale: protection exists, almost no one claims it,
// and $10B+ goes unclaimed every year. Big amber count-up is the beat.

import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

// Beat-local COMPRESSED fork of peer's Scene02Gap (src/new-video untouched).
// 1080f → 540f: first ~360f (top line + $10B+ count-up + label) kept ~as-is;
// the second half (lineB + footnote, stranded after a ~350f dead hold) is
// recompressed into ~180f with a spring snap, then a 40f out-fade.
const GAP_F = 540; // was S2_GAP_F (1080)

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

export const Scene02GapFast: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.012} startF={0} endF={GAP_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const snap = (start: number) =>
    Math.min(
      1,
      Math.max(0, spring({ frame: frame - start, fps, config: { damping: 14, mass: 0.5 }, durationInFrames: 18 })),
    );

  const lineAOp = interpolate(frame, [10, 46], [0, 1], clamp);
  const lineAY = interpolate(frame, [10, 46], [18, 0], clamp);

  // Big count-up to $10B+
  const countT = interpolate(frame, [90, 340], [0, 10], clamp);
  const bigOp = interpolate(frame, [90, 130], [0, 1], clamp);
  const bigScale = interpolate(frame, [90, 140], [0.92, 1], clamp);

  const labelOp = interpolate(frame, [300, 340], [0, 1], clamp);

  // Compressed second half: lineB pulled 560→365 (spring snap), footnote 640→410.
  const lineBS = snap(365);
  const lineBOp = lineBS;
  const lineBY = (1 - lineBS) * 16;

  const footOp = interpolate(frame, [410, 430], [0, 1], clamp);
  const outOp = interpolate(frame, [GAP_F - 40, GAP_F], [1, 0], clamp);

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
