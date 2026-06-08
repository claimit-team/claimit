// Scene 1 — HOOK (rebuilt) · 600f · single-product, sense-of-time open.
// Two squarish cards side by side: LEFT = the Sony WH-1000XM5 purchase (product
// tile + price), RIGHT = a real month calendar whose days fill in one by one
// (sense of time passing). Then the price drops $399.99 → $349.99 (amber) and an
// "owed $50" badge pops. Per review: two squarish cards, headphones image left,
// actual calendar right.
import { getDay, getDaysInMonth } from "date-fns";
import { Headphones } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

const HOOK_F = 600; // unchanged (keeps b02's slot in MasterDemo)

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

const PAID = 399.99;
const DROPPED = 349.99;

// Calendar — May 2026 price-match window. Bought on the 11th, drop on the 25th.
const YEAR = 2026;
const MONTH = 4; // May (0-indexed)
const PURCHASE_DAY = 11;
const DROP_DAY = 25;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Timeline ──
const CARD_IN = [0, 40] as const;
const DAYS_FILL = [80, 300] as const; // calendar fills day-by-day
const DROP_F = 332; // price drops after the window has run
const BADGE_F = 394; // "owed $50" pops

// ── Layout — two upright (taller-than-wide) cards, centred ──
const CARD_W = 452;
const CARD_H = 568;
const GAP = 60;
const LX = (1920 - (2 * CARD_W + GAP)) / 2; // 482
const RX = LX + CARD_W + GAP; // 994
const CY = (1080 - CARD_H) / 2; // 256

export const Scene01HookFast: React.FC = () => (
  <LightScene>
    <Camera from={1.0} to={1.03} startF={0} endF={HOOK_F}>
      <Inner />
    </Camera>
  </LightScene>
);

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  // Card entrances (left slightly before right).
  const lOp = interpolate(frame, CARD_IN, [0, 1], clamp);
  const lTy = interpolate(frame, CARD_IN, [26, 0], clamp);
  const rOp = interpolate(frame, [16, 56], [0, 1], clamp);
  const rTy = interpolate(frame, [16, 56], [26, 0], clamp);

  // Drop state.
  const dropped = frame >= DROP_F;
  const newOp = interpolate(frame, [DROP_F, DROP_F + 26], [0, 1], clamp);
  const strike = interpolate(frame, [DROP_F, DROP_F + 26], [0, 1], clamp);
  const lift = interpolate(frame, [DROP_F, DROP_F + 30], [0, -10], clamp);
  const badgeOp = interpolate(frame, [BADGE_F, BADGE_F + 30], [0, 1], clamp);
  const badgeY = interpolate(frame, [BADGE_F, BADGE_F + 30], [12, 0], clamp);

  // Calendar fill — the "today" marker advances purchase → drop day.
  const fillT = interpolate(frame, DAYS_FILL, [0, 1], clamp);
  const currentDay = dropped
    ? DROP_DAY
    : PURCHASE_DAY + Math.round(fillT * (DROP_DAY - PURCHASE_DAY));

  return (
    <AbsoluteFill>
      {/* LEFT — Sony product card */}
      <div
        style={{
          position: "absolute",
          left: LX,
          top: CY,
          width: CARD_W,
          height: CARD_H,
          opacity: lOp,
          transform: `translateY(${(lTy + lift).toFixed(1)}px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            background: COLOR.WHITE,
            borderRadius: 24,
            border: `1px solid ${COLOR.NAVY}`,
            boxShadow: "0 30px 70px rgba(20,30,50,0.16)",
            padding: 34,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            textAlign: "center",
          }}
        >
          {/* Product image tile */}
          <div
            style={{
              width: 220,
              height: 156,
              borderRadius: 18,
              background: COLOR.N50,
              border: `1px solid ${COLOR.LINE}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Headphones size={86} color={COLOR.NAVY} strokeWidth={1.6} aria-label="headphones" />
          </div>

          <div>
            <div style={{ ...TYPE.DISPLAY_S, fontSize: 36, color: COLOR.INK }}>Sony WH-1000XM5</div>
            <div style={{ ...TYPE.MICRO, fontSize: 19, color: COLOR.MUTE, marginTop: 6 }}>
              Wireless headphones
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span
              style={{
                ...TYPE.SUB,
                fontSize: 38,
                fontWeight: 600,
                color: dropped ? COLOR.MUTE : COLOR.INK,
                textDecoration: strike > 0.5 ? "line-through" : "none",
                opacity: dropped ? 0.7 : 1,
              }}
            >
              {fmt(PAID)}
            </span>
            {dropped ? (
              <span
                style={{
                  ...TYPE.SUB,
                  fontSize: 44,
                  fontWeight: 700,
                  color: COLOR.AMBER,
                  opacity: newOp,
                }}
              >
                {fmt(DROPPED)}
              </span>
            ) : null}
          </div>

          {/* "owed $50" badge */}
          {frame >= BADGE_F ? (
            <div
              style={{
                position: "absolute",
                right: 22,
                top: -20,
                padding: "8px 18px",
                borderRadius: 999,
                background: COLOR.AMBER_BG,
                border: `1px solid ${COLOR.AMBER}`,
                color: "#9A6700",
                ...TYPE.MICRO,
                fontSize: 20,
                fontWeight: 700,
                opacity: badgeOp,
                transform: `translateY(${badgeY.toFixed(1)}px)`,
                whiteSpace: "nowrap",
              }}
            >
              You're owed $50
            </div>
          ) : null}
        </div>
      </div>

      {/* RIGHT — real calendar; days fill in (time passing) */}
      <div
        style={{
          position: "absolute",
          left: RX,
          top: CY,
          width: CARD_W,
          height: CARD_H,
          opacity: rOp,
          transform: `translateY(${rTy.toFixed(1)}px)`,
        }}
      >
        <CalendarCard currentDay={currentDay} dropped={dropped} />
      </div>
    </AbsoluteFill>
  );
};

const CalendarCard: React.FC<{ currentDay: number; dropped: boolean }> = ({
  currentDay,
  dropped,
}) => {
  const first = new Date(YEAR, MONTH, 1);
  const startDow = getDay(first); // 0=Sun
  const daysInMonth = getDaysInMonth(first);
  // Pad leading blanks so the 1st lands under the right weekday.
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        background: COLOR.WHITE,
        borderRadius: 24,
        border: `1px solid ${COLOR.LINE}`,
        boxShadow: "0 30px 70px rgba(20,30,50,0.10)",
        padding: "26px 28px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ ...TYPE.DISPLAY_S, fontSize: 26, color: COLOR.INK }}>May 2026</span>
        <span style={{ ...TYPE.MICRO, fontSize: 16, color: COLOR.MUTE }}>Price-match window</span>
      </div>

      {/* Weekday row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          marginTop: 16,
          marginBottom: 6,
        }}
      >
        {WEEKDAYS.map((d, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday header
            key={i}
            style={{
              textAlign: "center",
              ...TYPE.MICRO,
              fontSize: 13,
              fontWeight: 600,
              color: COLOR.MUTE,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridAutoRows: "1fr",
          gap: 4,
        }}
      >
        {cells.map((day, i) => {
          if (day === null)
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed blank pad cell
              <div key={`b${i}`} />
            );
          const elapsed = day >= PURCHASE_DAY && day <= currentDay;
          const isPurchase = day === PURCHASE_DAY;
          const isCurrent = day === currentDay && !dropped;
          const isDrop = day === DROP_DAY && dropped;

          let bg = "transparent";
          let color: string = COLOR.BODY;
          let border = "1px solid transparent";
          let shadow = "none";
          if (isDrop) {
            bg = COLOR.AMBER;
            color = COLOR.WHITE;
          } else if (isPurchase) {
            bg = COLOR.NAVY;
            color = COLOR.WHITE;
          } else if (elapsed) {
            bg = "rgba(39,70,110,0.12)";
            color = COLOR.NAVY;
          } else {
            color = "#9AA3B2";
          }
          if (isCurrent) {
            border = `1px solid ${COLOR.NAVY}`;
            shadow = "0 0 0 2px rgba(39,70,110,0.25)";
          }

          return (
            <div
              key={day}
              style={{
                borderRadius: 9,
                background: bg,
                border,
                boxShadow: shadow,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...TYPE.MICRO,
                fontSize: 16,
                fontWeight: isPurchase || isDrop ? 700 : 500,
                color,
              }}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Status line */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          ...TYPE.MICRO,
          fontSize: 18,
          fontWeight: 600,
          color: dropped ? COLOR.AMBER : COLOR.MUTE,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: dropped ? COLOR.AMBER : COLOR.NAVY,
          }}
        />
        {dropped ? "Price dropped · May 25" : `Watching the price · May ${currentDay}`}
      </div>
    </div>
  );
};
