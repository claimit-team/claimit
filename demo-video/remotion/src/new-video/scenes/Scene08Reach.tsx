// Scene 8 — Reach · 2:18–2:28 · 600f · light.
// One agent, every checkout: a wall of 26 platform logos (retail /
// airlines / hotels) staggers in. Wires public/platformlogo SVGs.
// (Tech + MCP sponsors get their own dedicated scene next.)

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

export const Scene08Reach: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.012} startF={0} endF={S8_REACH_F}>
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
  const outOp = iv(frame, [S8_REACH_F - 36, S8_REACH_F], [1, 0]);

  return (
    <AbsoluteFill style={{ opacity: outOp }}>
      {/* Headline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 150,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          fontSize: 52,
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
          top: 236,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 28,
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
          left: 200,
          right: 200,
          top: 360,
          display: "flex",
          flexWrap: "wrap",
          gap: 22,
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
                width: 168,
                height: 92,
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
                style={{ maxHeight: 44, maxWidth: 120, objectFit: "contain" }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
