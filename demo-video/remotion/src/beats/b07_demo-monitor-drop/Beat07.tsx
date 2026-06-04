// Beat 07 — DEMO · background monitor + 4 progressive checks + drop detect · ~13s / 760f.
// Picks up after Beat06's confirm. Will consolidate b15-b17 pending review;
// b15-b17 left intact. Subtitle-only. NO cursor (background monitoring).
// Clean focus view (no app shell). All motion frame-driven (JITTER-GUARD safe).
//
// CHART (custom SVG timeline in PriceChartClean):
//   • Exactly 4 record dots. Dots are EQUALLY SPACED at (i+0.5)/N for the
//     current count N, so when a new dot lands the existing ones MIGRATE left
//     smoothly (easeInOut) while the new one pops in at its final slot.
//       N=1 → 0.5 · N=2 → 0.25,0.75 · N=3 → .167,.5,.833 · N=4 → .125,.375,.625,.875
//   • Dots 1-3 sit at the flat $599.99 level; dot 4 IS the drop — it descends to
//     $499.99 (line flat 1-2-3, drops 3→4). A blue iOS-style toast pops at the drop.
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  ENTRY ......... 0-90    fade in + scale 0.85 → 1.0 (easeOut), settle.
//  B  MONITOR ....... 90-420  4 checks land (dots @120/220/320/420, ~100f apart);
//        each pops (spring) + the existing dots migrate; price ticks per check.
//        sub "After you confirm, we monitor the price in the background." f110-360
//  C  DROP .......... 420-660 dot 4 descends $599.99→$499.99 (420-438); readout
//        fluctuates (live scanner) → settles $499.99 + "↓ $100 drop"; blue drop
//        toast pops (426). Hold.  sub "Then — a drop." f425-600
//  D  EXIT .......... 660-760 fade to 0 (easeIn). Creep zoom 1.0 → 1.04 throughout.
// ──────────────────────────────────────────────────────────────────────────────
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { type Dot, PriceChartClean } from "./PriceChartClean";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const DOT_START = [120, 220, 320, 420];
const MIG = 26;
const DROP_START = DOT_START[3]; // 420
const FLAT = 599.99;
const DROP = 499.99;

const CYCLE = [
  "$599.99",
  "$597.43",
  "$601.10",
  "$598.40",
  "$602.18",
  "$596.20",
  "$603.05",
  "$499.99",
  "$541.30",
  "$499.99",
  "$508.90",
  "$499.99",
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const Beat07: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = easings.easeInOut;

  // Entry scale + continuous creep zoom (center push).
  const entry = interpolate(frame, [0, 40], [0.85, 1.0], { ...C, easing: easings.easeOut });
  const creep = interpolate(frame, [90, 420, 660, 760], [1.0, 1.02, 1.035, 1.04], C);
  const scale = frame < 90 ? entry : creep;
  const opacity =
    interpolate(frame, [0, 30], [0, 1], C) *
    interpolate(frame, [660, 750], [1, 0], { ...C, easing: easings.easeIn });

  // Drop progress (dot 4 descent) + fluctuation gating.
  const dropP = interpolate(frame, [DROP_START, DROP_START + 18], [0, 1], { ...C, easing: ease });

  // Visible-dot count + migration interpolant for the most recent arrival.
  let n = 0;
  for (let k = 0; k < DOT_START.length; k++) if (frame >= DOT_START[k]) n = k + 1;
  const lastK = n - 1;
  const migT =
    lastK >= 1
      ? interpolate(frame, [DOT_START[lastK], DOT_START[lastK] + MIG], [0, 1], {
          ...C,
          easing: ease,
        })
      : 1;

  const dots: Dot[] = [];
  for (let i = 0; i < n; i++) {
    const xFrac = i === lastK ? (i + 0.5) / n : lerp((i + 0.5) / (n - 1), (i + 0.5) / n, migT);
    const price = i < 3 ? FLAT : FLAT - dropP * (FLAT - DROP);
    const sc = interpolate(frame - DOT_START[i], [0, 4, 12], [0.3, 1.6, 1], C);
    dots.push({ idx: i, xFrac, price, scale: sc, isDrop: i === 3 });
  }

  // Current-price readout (fluctuates as the drop lands, then settles).
  let priceText = "$599.99";
  if (frame >= DROP_START && frame < DROP_START + 38)
    priceText =
      CYCLE[Math.min(CYCLE.length - 1, Math.max(0, Math.floor((frame - DROP_START) / 3.2)))];
  else if (frame >= DROP_START + 38) priceText = "$499.99";
  const dropped = frame >= DROP_START + 38;

  // Tick pulse per check + settle bump when the drop lands.
  let priceScale = 1;
  for (const s of [DOT_START[0], DOT_START[1], DOT_START[2]]) {
    if (frame >= s && frame <= s + 12)
      priceScale = 1 + 0.014 * Math.sin(((frame - s) / 12) * Math.PI);
  }
  if (frame >= DROP_START + 38 && frame <= DROP_START + 54)
    priceScale = 1 + 0.05 * Math.sin(((frame - (DROP_START + 38)) / 16) * Math.PI);

  const toastP = interpolate(frame, [DROP_START + 6, DROP_START + 22], [0, 1], {
    ...C,
    easing: easings.easeOut,
  });

  return (
    <HookAtmosphere>
      <AbsoluteFill
        style={{
          opacity,
          transform: `scale(${scale.toFixed(4)})`,
          transformOrigin: "center center",
        }}
      >
        <PriceChartClean
          dots={dots}
          checksLogged={n}
          priceText={priceText}
          priceScale={priceScale}
          dropped={dropped}
          toastP={toastP}
        />
      </AbsoluteFill>

      <BeatSubtitle
        text="After you confirm, we monitor the price in the background."
        fromFrame={110}
        durationFrames={250}
      />
      <BeatSubtitle text="Then — a drop." fromFrame={425} durationFrames={175} />
    </HookAtmosphere>
  );
};
