// Fork of peer Scene08Reach — ONLY the 0-9s logo-wall portion (headline + sub +
// 26 platform logos), rebased to frame 0. Tech strip dropped (it's in b05) and
// the LightScene/Camera/outOp wrapper removed (Beat09 provides bg + creep zoom +
// the push-up exit). Peer's logo assets (public/platformlogo/*.svg) reused.
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";

import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

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

export const Scene08ReachLogosFast: React.FC = () => {
  const frame = useCurrentFrame();
  const headOp = iv(frame, [8, 44], [0, 1]);
  const headY = iv(frame, [8, 44], [18, 0]);
  const subOp = iv(frame, [40, 80], [0, 1]);

  return (
    <AbsoluteFill>
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

      <div
        style={{
          position: "absolute",
          left: 160,
          right: 160,
          top: 248,
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
    </AbsoluteFill>
  );
};
