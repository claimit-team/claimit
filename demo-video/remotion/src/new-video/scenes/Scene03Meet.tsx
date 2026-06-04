// Scene 3 — Meet ClaimIt · 0:30–0:42 · 720f · light brand snap.
// Shield + "ClaimIt" wordmark resolves with the brand letter-spacing
// tighten (-1.0 → -2.6px), tagline + one-liner follow. Soft navy bloom.

import { ShieldCheck } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { DP3_TAGLINE } from "../../shots/_shared/data";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { S3_MEET_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

export const Scene03Meet: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.015} startF={0} endF={S3_MEET_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  const logoOp = interpolate(frame, [0, 40], [0, 1], clamp);
  const logoScale = interpolate(frame, [0, 48], [0.7, 1], clamp);
  const track = interpolate(frame, [0, 48], [-1.0, -2.6], clamp); // brand snap
  const bloom = interpolate(frame, [0, 50, 120], [0, 0.5, 0.28], clamp);

  const tagOp = interpolate(frame, [70, 110], [0, 1], clamp);
  const tagY = interpolate(frame, [70, 110], [16, 0], clamp);

  const oneOp = interpolate(frame, [170, 220], [0, 1], clamp);
  const oneY = interpolate(frame, [170, 220], [16, 0], clamp);

  const outOp = interpolate(frame, [S3_MEET_F - 36, S3_MEET_F], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ opacity: outOp }}>
      {/* Soft navy bloom behind the wordmark */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 392,
          width: 900,
          height: 520,
          marginLeft: -450,
          marginTop: -260,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(39,70,110,0.16) 0%, transparent 60%)",
          opacity: bloom,
          filter: "blur(8px)",
        }}
      />

      {/* Shield + wordmark */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 392 - 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          opacity: logoOp,
          transform: `scale(${logoScale.toFixed(4)})`,
        }}
      >
        <ShieldCheck size={84} color={COLOR.NAVY} strokeWidth={2.2} />
        <span
          style={{ ...TYPE.DISPLAY, color: COLOR.NAVY, letterSpacing: `${track.toFixed(3)}px` }}
        >
          ClaimIt
        </span>
      </div>

      {/* Tagline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 540,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          color: COLOR.INK,
          opacity: tagOp,
          transform: `translateY(${tagY}px)`,
        }}
      >
        {DP3_TAGLINE}
      </div>

      {/* One-liner */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 660,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 30,
          color: COLOR.BODY,
          opacity: oneOp,
          transform: `translateY(${oneY}px)`,
        }}
      >
        It watches what you buy — and builds the refund claim the moment a price drops.
      </div>
    </AbsoluteFill>
  );
};
