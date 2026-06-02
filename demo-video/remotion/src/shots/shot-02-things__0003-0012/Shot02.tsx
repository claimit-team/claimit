// SHOT 02 — The things you bought · 0:03–0:12 · 540 f · Act I · Dark
//
// v3 review changes:
//   BUG-1 — Chip widened 360→420 + display names shortened in
//           DP1_PURCHASE_CHIPS (data.ts). maxWidth on the title slot
//           raised 230→260. Re-tuned CHIP_LAYOUT x/y so the wider
//           boxes don't overlap on the 1920 canvas.
//   BUG-2 — Parallax horizontal drift (DEPTH_DRIFT_PX_PER_540 +
//           driftX) removed entirely. The staggered FAR/MID/NEAR
//           fade-up ordering is preserved as the only motion before
//           the drop.
//
// Six purchase chips fade+rise in (depth-staggered). At f300, C1
// Sony's price changes $399.99 → $349.99 amber, +8px lift, the other
// chips dim. Line A appears at f60–96, Line B at f330–366.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DarkScene } from "../_shared/DarkScene";
import { DP1_PURCHASE_CHIPS } from "../_shared/data";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

interface ChipPos {
  index: number;
  x: number;
  y: number;
  depth: "FAR" | "MID" | "NEAR";
  fadeStartF: number;
}

// BUG-1 (v3 review follow-up): chip width bumped 420 → 480 so all 6
// product names render in full (no ellipsis truncation). Positions
// re-tuned so the new half-width 240 keeps every chip inside the
// SHOT_SPEC §1.9 safe area (x ∈ [160, 1760]). Two-col stagger across
// three vertical bands, leaving the y=440–570 strip open for the two
// headline lines (y=470, y=560).
const CHIP_LAYOUT: ChipPos[] = [
  { index: 0, x: 480, y: 240, depth: "FAR", fadeStartF: 0 }, // Sony (hero)
  { index: 1, x: 1420, y: 240, depth: "FAR", fadeStartF: 0 }, // MacBook
  { index: 2, x: 1520, y: 720, depth: "MID", fadeStartF: 20 }, // United
  { index: 3, x: 400, y: 720, depth: "MID", fadeStartF: 20 }, // Hilton
  { index: 4, x: 560, y: 890, depth: "NEAR", fadeStartF: 40 }, // KitchenAid
  { index: 5, x: 1360, y: 890, depth: "NEAR", fadeStartF: 40 }, // Anker
];

const CHIP_W = 480;
const CHIP_H = 100;

const fmtPrice = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const DROP_F = 300; // C1 Sony price change

export const Shot02: React.FC = () => {
  const frame = useCurrentFrame();

  // Final cross-dissolve out
  const outOpacity = interpolate(frame, [520, 540], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return (
    <DarkScene>
      <AbsoluteFill style={{ opacity: outOpacity }}>
        {/* Chips */}
        {CHIP_LAYOUT.map((pos) => {
          const chip = DP1_PURCHASE_CHIPS[pos.index];
          const localFade = interpolate(frame, [pos.fadeStartF, pos.fadeStartF + 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_UI,
          });
          const yRise = interpolate(frame, [pos.fadeStartF, pos.fadeStartF + 40], [24, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_UI,
          });

          // BUG-2: no parallax drift. Chips end at static x/y.

          // Hero-chip post-drop lift + brightness
          const isHero = pos.index === 0;
          const heroLiftY = isHero
            ? interpolate(frame, [DROP_F, DROP_F + 20], [0, -8], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_UI,
              })
            : 0;
          const heroBorderOpacity = isHero
            ? interpolate(frame, [DROP_F, DROP_F + 20], [0.08, 0.22], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_UI,
              })
            : 0.08;

          // Non-hero chips dim post-drop
          const dimOpacity = isHero
            ? 1
            : interpolate(frame, [DROP_F, DROP_F + 20], [1, 0.5], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_UI,
              });
          const dimBlur = isHero
            ? 0
            : interpolate(frame, [DROP_F, DROP_F + 20], [0, 2], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_UI,
              });

          // Sony price crossfade $399.99 → $349.99 over f300–312
          const showNewPrice = frame >= DROP_F + 12;
          const newPriceY = interpolate(frame, [DROP_F, DROP_F + 12], [12, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_UI,
          });
          const oldPriceY = interpolate(frame, [DROP_F, DROP_F + 12], [0, -12], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_UI,
          });

          // Amber tint for 18f after new price lands, then settle to #6B7280
          const settleToMute = isHero
            ? interpolate(frame, [DROP_F + 30, DROP_F + 48], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_UI,
              })
            : 1;
          const heroPriceColor =
            settleToMute >= 0.999
              ? COLOR.MUTE
              : settleToMute > 0 || (isHero && frame >= DROP_F + 12)
                ? COLOR.AMBER
                : COLOR.MUTE;

          // Amber underline sweep f300–316 (16f) left→right under C1
          const underlineProgress = isHero
            ? interpolate(frame, [DROP_F, DROP_F + 16], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_UI,
              })
            : 0;

          return (
            <div
              key={pos.index}
              style={{
                position: "absolute",
                left: pos.x - CHIP_W / 2,
                top: pos.y - CHIP_H / 2 + heroLiftY,
                width: CHIP_W,
                height: CHIP_H,
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid rgba(255,255,255,${heroBorderOpacity})`,
                opacity: localFade * dimOpacity,
                transform: `translateY(${yRise}px)`,
                filter: dimBlur ? `blur(${dimBlur}px)` : "none",
                padding: "0 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxSizing: "border-box",
                overflow: "hidden",
                gap: 16,
              }}
            >
              <div
                style={{
                  ...TYPE.SUB,
                  color: "#FFFFFF",
                  opacity: 0.92,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  // BUG-1 follow-up: title slot widened to 320 so the
                  // shortened DP-1 names all render in full (longest
                  // is "MacBook Neo A18 Pro" at ~270 px in 28px Inter).
                  maxWidth: 320,
                }}
              >
                {chip.title}
              </div>
              {/* Price area */}
              <div
                style={{
                  position: "relative",
                  width: 110,
                  height: 36,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {/* Old price */}
                {isHero ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      ...TYPE.MICRO,
                      color: COLOR.MUTE,
                      transform: `translateY(${oldPriceY}px)`,
                      opacity:
                        frame < DROP_F
                          ? 1
                          : interpolate(frame, [DROP_F, DROP_F + 12], [1, 0], {
                              extrapolateLeft: "clamp",
                              extrapolateRight: "clamp",
                              easing: EASE_UI,
                            }),
                    }}
                  >
                    {fmtPrice(chip.paid)}
                  </div>
                ) : (
                  <div style={{ ...TYPE.MICRO, color: COLOR.MUTE }}>{fmtPrice(chip.paid)}</div>
                )}
                {/* New price (hero only) */}
                {isHero && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      ...TYPE.MICRO,
                      color: heroPriceColor,
                      transform: `translateY(${newPriceY}px)`,
                      opacity: showNewPrice ? 1 : 0,
                    }}
                  >
                    {fmtPrice(chip.current ?? chip.paid)}
                  </div>
                )}
              </div>
              {/* Amber underline sweep */}
              {isHero && underlineProgress > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: 0,
                    height: 1,
                    width: `${underlineProgress * 100}%`,
                    background: COLOR.AMBER,
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Line A — y=470 */}
        <HeadlineLine
          y={470}
          text="Every day, the things you buy quietly drop in price."
          startF={60}
        />

        {/* Line B — y=560, appears f330–366 */}
        <HeadlineLine y={560} text="The difference is yours to claim." startF={330} />
      </AbsoluteFill>
    </DarkScene>
  );
};

const HeadlineLine: React.FC<{ y: number; text: string; startF: number }> = ({
  y,
  text,
  startF,
}) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [startF, startF + 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const yRise = interpolate(frame, [startF, startF + 36], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y,
        textAlign: "center",
        ...TYPE.DISPLAY_S,
        color: "#FFFFFF",
        opacity: fade,
        transform: `translateY(${yRise}px)`,
      }}
    >
      {text}
    </div>
  );
};
