// Scene 8 — Reach + Tech · 2:22–2:42 · 1200f · light.
// One agent, every checkout: a wall of 26 platform logos (retail /
// airlines / hotels) staggers in, then a high-level tech strip
// ("Built on Google Cloud + Gemini"). Wires the logo SVGs in
// public/platformlogo + public/brandlogos (previously unused).

import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { S8_REACH_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

const PLATFORMS = [
  "amazon",
  "walmart",
  "best_buy",
  "target",
  "costco",
  "home_depot",
  "lowes",
  "macys",
  "nordstrom",
  "dicks",
  "jcpenney",
  "newegg",
  "staples",
  "crutchfield",
  "dell",
  "alaska",
  "american",
  "delta",
  "jetblue",
  "southwest",
  "united",
  "hilton",
  "hyatt",
  "ihg",
  "marriott",
  "wyndham",
];

const TECH: { file: string; label: string }[] = [
  { file: "googlegemini", label: "Gemini" },
  { file: "googlecloud", label: "Google Cloud" },
  { file: "mongodb", label: "MongoDB" },
  { file: "elasticsearch", label: "Elasticsearch" },
  { file: "googlepubsub", label: "Pub/Sub" },
  { file: "gmail", label: "Gmail API" },
  { file: "nextdotjs", label: "Next.js" },
  { file: "vercel", label: "Vercel" },
];

export const Scene08Reach: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.01} startF={0} endF={S8_REACH_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  const headOp = iv(frame, [8, 44], [0, 1]);
  const headY = iv(frame, [8, 44], [18, 0]);
  const subOp = iv(frame, [40, 80], [0, 1]);

  const techLabelOp = iv(frame, [620, 670], [0, 1]);
  const outOp = iv(frame, [S8_REACH_F - 36, S8_REACH_F], [1, 0]);

  return (
    <AbsoluteFill style={{ opacity: outOp }}>
      {/* Headline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 96,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          fontSize: 48,
          color: COLOR.INK,
          opacity: headOp,
          transform: `translateY(${headY}px)`,
        }}
      >
        One agent. Every checkout.
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 176,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 26,
          color: COLOR.MUTE,
          opacity: subOp,
        }}
      >
        Retail · Airlines · Hotels
      </div>

      {/* Platform logo wall */}
      <div
        style={{
          position: "absolute",
          left: 160,
          right: 160,
          top: 260,
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          justifyContent: "center",
        }}
      >
        {PLATFORMS.map((name, i) => {
          const at = 70 + i * 7;
          const op = iv(frame, [at, at + 26], [0, 1]);
          const ty = iv(frame, [at, at + 26], [12, 0]);
          return (
            <div
              key={name}
              style={{
                width: 150,
                height: 84,
                borderRadius: 12,
                background: COLOR.WHITE,
                border: `1px solid ${COLOR.LINE}`,
                boxShadow: "0 8px 20px rgba(20,30,50,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: op,
                transform: `translateY(${ty}px)`,
              }}
            >
              <img
                src={staticFile(`platformlogo/${name}.svg`)}
                alt={name}
                style={{ maxHeight: 40, maxWidth: 110, objectFit: "contain" }}
              />
            </div>
          );
        })}
      </div>

      {/* Tech strip */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 792,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 24,
          fontWeight: 600,
          color: COLOR.NAVY,
          opacity: techLabelOp,
        }}
      >
        Built on Google Cloud + Gemini
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 856,
          display: "flex",
          gap: 40,
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        {TECH.map((t, i) => {
          const at = 700 + i * 16;
          const op = iv(frame, [at, at + 26], [0, 1]);
          const ty = iv(frame, [at, at + 26], [10, 0]);
          return (
            <div
              key={t.file}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                width: 130,
                opacity: op,
                transform: `translateY(${ty}px)`,
              }}
            >
              <img
                src={staticFile(`brandlogos/${t.file}.svg`)}
                alt={t.label}
                style={{ height: 44, maxWidth: 100, objectFit: "contain" }}
              />
              <span style={{ ...TYPE.MICRO, fontSize: 16, color: COLOR.BODY, textAlign: "center" }}>
                {t.label}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
