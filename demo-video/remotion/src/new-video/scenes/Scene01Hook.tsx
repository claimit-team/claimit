// Scene 1 — Hook · 0:00–0:12 · 720f · upbeat light open.
// Montage of real purchases (DP-1 chips) rises in; the hero Sony chip's
// price drops $399.99 → $349.99 (amber), then an "owed $50" badge pops.
// Punchy kicker lands late so the hook works muted.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Camera } from "../../shots/_shared/Camera";
import { DP1_PURCHASE_CHIPS } from "../../shots/_shared/data";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { S1_HOOK_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 3 cols × 2 rows, centered on the 1920×1080 canvas.
const CARD_W = 460;
const CARD_H = 150;
const GAP = 40;
const COLS = 3;
const GRID_W = COLS * CARD_W + (COLS - 1) * GAP; // 1460
const GRID_X = (1920 - GRID_W) / 2; // 230
const GRID_Y = 392;

export const Scene01Hook: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.03} startF={0} endF={S1_HOOK_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  // Kicker (bottom) — three short lines stagger in late.
  const kickerLines = ["Prices drop.", "Stores owe you.", "You never find out."];

  return (
    <AbsoluteFill>
      {DP1_PURCHASE_CHIPS.map((chip, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = GRID_X + col * (CARD_W + GAP);
        const y = GRID_Y + row * (CARD_H + GAP);
        const inAt = 6 + i * 9;
        const op = interpolate(frame, [inAt, inAt + 30], [0, chip.hero ? 1 : 0.96], clamp);
        const ty = interpolate(frame, [inAt, inAt + 30], [22, 0], clamp);
        // Non-hero chips dim slightly once the hero drop happens (focus).
        const dim = chip.hero ? 1 : interpolate(frame, [150, 200], [0.96, 0.5], clamp);
        return (
          <Chip
            key={chip.title}
            chip={chip}
            x={x}
            y={y}
            frame={frame}
            style={{ opacity: Math.min(op, dim), transform: `translateY(${ty}px)` }}
          />
        );
      })}

      {/* Kicker */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 858, textAlign: "center" }}>
        {kickerLines.map((line, i) => {
          const at = 470 + i * 70;
          const op = interpolate(frame, [at, at + 26], [0, 1], clamp);
          const ty = interpolate(frame, [at, at + 26], [14, 0], clamp);
          const last = i === kickerLines.length - 1;
          return (
            <span
              key={line}
              style={{
                ...TYPE.DISPLAY_S,
                fontSize: 40,
                color: last ? COLOR.NAVY : COLOR.INK,
                opacity: op,
                transform: `translateY(${ty}px)`,
                display: "inline-block",
                margin: "0 14px",
              }}
            >
              {line}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Chip: React.FC<{
  chip: (typeof DP1_PURCHASE_CHIPS)[number];
  x: number;
  y: number;
  frame: number;
  style?: React.CSSProperties;
}> = ({ chip, x, y, frame, style }) => {
  const isHero = !!chip.hero;
  const dropF = 150;
  const dropped = isHero && chip.current !== undefined;
  const newOp = dropped ? interpolate(frame, [dropF, dropF + 24], [0, 1], clamp) : 0;
  const oldStrike = dropped ? interpolate(frame, [dropF, dropF + 24], [0, 1], clamp) : 0;
  const badgeOp = dropped ? interpolate(frame, [dropF + 60, dropF + 90], [0, 1], clamp) : 0;
  const badgeY = dropped ? interpolate(frame, [dropF + 60, dropF + 90], [10, 0], clamp) : 0;
  const lift = dropped ? interpolate(frame, [dropF, dropF + 30], [0, -6], clamp) : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 16,
        background: COLOR.WHITE,
        border: `1px solid ${isHero ? COLOR.NAVY : COLOR.LINE}`,
        boxShadow: isHero ? "0 24px 60px rgba(20,30,50,0.14)" : "0 12px 30px rgba(20,30,50,0.06)",
        padding: "22px 26px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 10,
        transform: `translateY(${lift}px)`,
        ...style,
      }}
    >
      <div
        style={{
          ...TYPE.SUB,
          fontSize: 24,
          fontWeight: 600,
          color: COLOR.INK,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {chip.title}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        {dropped ? (
          <>
            <span
              style={{
                ...TYPE.SUB,
                fontSize: 26,
                fontWeight: 600,
                color: COLOR.MUTE,
                textDecoration: oldStrike > 0.5 ? "line-through" : "none",
                opacity: 0.7,
              }}
            >
              {fmt(chip.paid)}
            </span>
            <span
              style={{
                ...TYPE.SUB,
                fontSize: 30,
                fontWeight: 700,
                color: COLOR.AMBER,
                opacity: newOp,
              }}
            >
              {fmt(chip.current as number)}
            </span>
          </>
        ) : (
          <span style={{ ...TYPE.SUB, fontSize: 26, fontWeight: 600, color: COLOR.BODY }}>
            {fmt(chip.paid)}
          </span>
        )}
      </div>

      {/* "owed $50" badge on the hero */}
      {dropped && (
        <div
          style={{
            position: "absolute",
            right: 18,
            top: -16,
            padding: "6px 14px",
            borderRadius: 999,
            background: COLOR.AMBER_BG,
            border: `1px solid ${COLOR.AMBER}`,
            color: "#9A6700",
            ...TYPE.MICRO,
            fontWeight: 700,
            opacity: badgeOp,
            transform: `translateY(${badgeY}px)`,
            whiteSpace: "nowrap",
          }}
        >
          You're owed $50
        </div>
      )}
    </div>
  );
};
