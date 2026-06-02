// SHOT 18 — Sign-off · 2:54–3:00 · 360 f · Act IV · Dark
//
// REDESIGN-4c (v3 review): replaces the duplicate "ClaimIt / ClaimIt
// / dot-separated-names" block with a single ClaimIt mark + a row
// of 4 circular headshot cards + URL footer + close-to-black.
//
// Headshot PNGs live at remotion/public/team/{name}.png, copied from
// apps/web/public/team/* (apps/web stays untouched).
//
// Timing (360 f / 6 s):
//   f0–40   ClaimIt logo + URL fade in.
//   f40–100 4 headshot cards stagger-fade in left→right (15 f offset).
//   f100–280 held.
//   f280–360 fade out, light retracts, last frame near-black.

import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { DarkScene } from "../_shared/DarkScene";
import { DP16_CLOSE } from "../_shared/data";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

interface Member {
  name: string;
  photo: string;
}

const TEAM: Member[] = [
  { name: DP16_CLOSE.team[0], photo: "team/erdun.png" },
  { name: DP16_CLOSE.team[1], photo: "team/raj.png" },
  { name: DP16_CLOSE.team[2], photo: "team/will.png" },
  { name: DP16_CLOSE.team[3], photo: "team/chris.png" },
];

const AVATAR_SIZE = 160;
const CARD_X = [480, 800, 1120, 1440]; // evenly distributed across 1920
const AVATAR_CY = 540;

export const Shot18: React.FC = () => {
  const frame = useCurrentFrame();

  // ClaimIt logo + URL fade in f0–40
  const headerOpacity = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Out fade f280–360 + light retract
  const outFade = interpolate(frame, [280, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const lightRetract = interpolate(frame, [280, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  // bg to pure black f320–360
  const bgToBlackT = interpolate(frame, [320, 360], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const bgChannel = Math.round(10 * (1 - bgToBlackT));
  const bg = `rgb(${bgChannel}, ${bgChannel}, ${bgChannel})`;

  return (
    <AbsoluteFill style={{ background: bg }}>
      <DarkScene style={{ background: "transparent" }} lightOpacity={0.05 * lightRetract}>
        <AbsoluteFill style={{ opacity: outFade }}>
          {/* Single ClaimIt mark at top center */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 200 - 24,
              textAlign: "center",
              ...TYPE.HEADLINE,
              color: "#FFFFFF",
              letterSpacing: "-0.4px",
              opacity: headerOpacity,
            }}
          >
            {DP16_CLOSE.brand}
          </div>

          {/* 4 headshot cards row */}
          {TEAM.map((m, i) => {
            const cardStart = 40 + i * 15;
            const cardEnd = cardStart + 30;
            const cardOpacity = interpolate(frame, [cardStart, cardEnd], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_UI,
            });
            const cardY = interpolate(frame, [cardStart, cardEnd], [8, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE_UI,
            });
            return (
              <div
                key={m.name}
                style={{
                  position: "absolute",
                  left: CARD_X[i] - AVATAR_SIZE / 2,
                  top: AVATAR_CY - AVATAR_SIZE / 2,
                  width: AVATAR_SIZE,
                  textAlign: "center",
                  opacity: cardOpacity,
                  transform: `translateY(${cardY}px)`,
                }}
              >
                <div
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "2px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <img
                    src={staticFile(m.photo)}
                    alt={m.name}
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 20,
                    ...TYPE.SUB,
                    fontWeight: 400,
                    color: "#FFFFFF",
                    letterSpacing: "0",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.name}
                </div>
              </div>
            );
          })}

          {/* URL footer */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 820 - 8,
              textAlign: "center",
              ...TYPE.FOOTNOTE,
              color: COLOR.MUTE,
              opacity: headerOpacity * 0.6,
            }}
          >
            {DP16_CLOSE.url}
          </div>
        </AbsoluteFill>
      </DarkScene>
    </AbsoluteFill>
  );
};
