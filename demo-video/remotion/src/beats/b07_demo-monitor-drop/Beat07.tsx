// Beat 07 — DEMO · background monitor + progressive checks + drop detect · ~13s / 780f.
// Picks up after Beat06's confirm. Will consolidate b15-b17 (watch → days pass →
// detect) pending review; b15-b17 left intact. Subtitle-only. NO cursor
// (background monitoring). Clean focus view (no app shell) on HookAtmosphere.
// All motion frame-driven (immune to the globals.css JITTER GUARD).
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  ENTRY ZOOM ............ 0-90    Content fades in + scales 0.85 → 1.0
//        (easeOut, ~40f), brief settle.
//  B  MONITOR ............... 90-510  Clean price-history view (product info +
//        prominent current price + recharts chart). 5 yellow "record" dots pop
//        in progressively (spring overshoot, ~70f apart) — one per auto-check;
//        the price readout ticks (subtle scale pulse) on each. Price holds
//        $599.99. CREEP ZOOM 1.0 → 1.02.
//        sub "After you confirm, we monitor the price in the background." f110-360
//  C  DROP DETECT ........... 510-700 A red drop dot pops at the last point; the
//        line descends $599.99 → $499.99 (516-540); the readout fluctuates like
//        a live scanner (510-548) then settles $499.99 with a "↓ $100 drop"
//        badge. Hold. CREEP ZOOM 1.02 → 1.04.
//        sub "Then — a drop." f520-690
//  D  EXIT FADE ............. 700-780 Whole composition fades to 0 (easeIn, ~75f);
//        creep zoom continues 1.04 → 1.05.
// ──────────────────────────────────────────────────────────────────────────────
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { easings } from "../../polish/easings";
import { PriceChartClean } from "./PriceChartClean";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// Record-dot pop schedule (phase B) — 5 yellow checks, evenly spaced.
const DOT_START = [140, 210, 280, 350, 420];
const DROP_DOT_START = 516;

// Live-scanner fluctuation (phase C) — quick cycle converging to $499.99.
const CYCLE = ["$599.99", "$597.43", "$601.10", "$598.40", "$602.18", "$596.20", "$603.05", "$499.99", "$541.30", "$499.99", "$508.90", "$499.99"];

export const Beat07: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = easings.easeInOut;

  // Entry scale + continuous creep zoom (center push).
  const entry = interpolate(frame, [0, 40], [0.85, 1.0], { ...C, easing: easings.easeOut });
  const creep = interpolate(frame, [90, 510, 690, 780], [1.0, 1.02, 1.04, 1.05], C);
  const scale = frame < 90 ? entry : creep;
  const opacity = interpolate(frame, [0, 30], [0, 1], C) * interpolate(frame, [700, 775], [1, 0], { ...C, easing: easings.easeIn });

  // Progressive record dots.
  let dotsVisible = 0;
  const dotScales: number[] = [];
  for (let k = 0; k < DOT_START.length; k++) {
    if (frame >= DOT_START[k]) dotsVisible = k + 1;
    dotScales[k] = interpolate(frame - DOT_START[k], [0, 4, 12], [0.3, 1.6, 1], C);
  }

  // Drop.
  const dropDotScale = frame < DROP_DOT_START ? 0 : interpolate(frame - DROP_DOT_START, [0, 5, 14], [0.3, 1.7, 1], C);
  const dropP = interpolate(frame, [516, 540], [0, 1], { ...C, easing: ease });
  const dropped = frame >= 548;

  // Current-price readout.
  let priceText = "$599.99";
  if (frame >= 510 && frame < 548) priceText = CYCLE[Math.min(CYCLE.length - 1, Math.max(0, Math.floor((frame - 510) / 3.2)))];
  else if (frame >= 548) priceText = "$499.99";

  // Tick pulse on each check (B) + a settle bump when the drop lands (C).
  let priceScale = 1;
  for (const s of DOT_START) {
    if (frame >= s && frame <= s + 12) priceScale = 1 + 0.014 * Math.sin(((frame - s) / 12) * Math.PI);
  }
  if (frame >= 548 && frame <= 564) priceScale = 1 + 0.05 * Math.sin(((frame - 548) / 16) * Math.PI);

  return (
    <HookAtmosphere>
      <AbsoluteFill style={{ opacity, transform: `scale(${scale.toFixed(4)})`, transformOrigin: "center center" }}>
        <PriceChartClean
          dotsVisible={dotsVisible}
          dotScales={dotScales}
          dropP={dropP}
          dropDotScale={dropDotScale}
          priceText={priceText}
          priceScale={priceScale}
          dropped={dropped}
        />
      </AbsoluteFill>

      <BeatSubtitle text="After you confirm, we monitor the price in the background." fromFrame={110} durationFrames={250} />
      <BeatSubtitle text="Then — a drop." fromFrame={520} durationFrames={170} />
    </HookAtmosphere>
  );
};
