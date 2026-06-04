// Scene 9 — Close · 2:42–3:00 · 1080f · light sign-off.
// Tagline reprise (brand letter-spacing tighten) → closing line →
// shield + wordmark → team · site · repo. Calm upbeat button.

import { ShieldCheck } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { DP3_TAGLINE, DP16_CLOSE } from "../../shots/_shared/data";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { S9_CLOSE_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

const REPO = "github.com/claimit-team/claimit";

export const Scene09Close: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.012} startF={0} endF={S9_CLOSE_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  const tagOp = iv(frame, [6, 54], [0, 1]);
  const trackVal = iv(frame, [6, 54], [-1.6, -2.6]);
  const tagY = iv(frame, [6, 54], [16, 0]);

  const lineOp = iv(frame, [90, 140], [0, 1]);
  const brandOp = iv(frame, [220, 270], [0, 1]);
  const brandY = iv(frame, [220, 270], [14, 0]);
  const teamOp = iv(frame, [300, 350], [0, 1]);
  const linksOp = iv(frame, [350, 400], [0, 1]);

  const outOp = iv(frame, [S9_CLOSE_F - 60, S9_CLOSE_F], [1, 0.0]);

  return (
    <AbsoluteFill style={{ opacity: outOp }}>
      {/* Tagline reprise */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 300,
          textAlign: "center",
          ...TYPE.DISPLAY,
          color: COLOR.INK,
          letterSpacing: `${trackVal.toFixed(3)}px`,
          opacity: tagOp,
          transform: `translateY(${tagY}px)`,
        }}
      >
        {DP3_TAGLINE}
      </div>

      {/* Closing line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 446,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 30,
          color: COLOR.MUTE,
          opacity: lineOp,
        }}
      >
        We just make sure you get it.
      </div>

      {/* Shield + wordmark */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          opacity: brandOp,
          transform: `translateY(${brandY}px)`,
        }}
      >
        <ShieldCheck size={48} color={COLOR.NAVY} strokeWidth={2.2} />
        <span
          style={{ ...TYPE.DISPLAY_S, fontSize: 56, color: COLOR.NAVY, letterSpacing: "-1.6px" }}
        >
          {DP16_CLOSE.brand}
        </span>
      </div>

      {/* Team */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 706,
          textAlign: "center",
          ...TYPE.MICRO,
          fontSize: 20,
          color: COLOR.BODY,
          opacity: teamOp,
        }}
      >
        {DP16_CLOSE.teamLine}
      </div>

      {/* Links */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 752,
          textAlign: "center",
          ...TYPE.MICRO,
          fontSize: 18,
          color: COLOR.MUTE,
          opacity: linksOp,
        }}
      >
        {DP16_CLOSE.url}
        <span style={{ margin: "0 14px", opacity: 0.5 }}>·</span>
        {REPO}
      </div>

      {/* Hackathon credit */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 800,
          textAlign: "center",
          ...TYPE.FOOTNOTE,
          opacity: linksOp * 0.6,
        }}
      >
        Google Cloud Rapid Agent Hackathon · June 2026
      </div>
    </AbsoluteFill>
  );
};
