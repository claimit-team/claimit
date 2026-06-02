// SHOT 06 — Monitor detects the drop · 0:36–0:44 · 480 f · Act III ·
// Light · Stage begins. Real PriceChart line-draw (fabricated entrance),
// amber dots pop, "$349.99" label appears, monitor caption chip.
// Camera: push-in 1.000→1.015 over the full 480 f.

import { interpolate } from "remotion";

import { ACT_III_SHOT_OFFSETS, SHOT_06_DURATION_F } from "../_shared/durations";
import { EASE_CAM, EASE_UI } from "../_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState, type ShotDirector } from "../_shared/types";

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();
  s.focus = { draft: 1, evidence: 1, assistant: 1, fullSharp: true };

  // Window/shell layers: priceChart fades up f0–24, holds, fades down f450–480.
  const priceChartUp = interpolate(localF, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const priceChartDown = interpolate(localF, [450, 480], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.layers.priceChart = Math.min(priceChartUp, priceChartDown);

  // Camera 1.000 → 1.015 over the shot
  s.cameraScale = interpolate(localF, [0, SHOT_06_DURATION_F], [1.0, 1.015], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_CAM,
  });

  // Reference line "Paid $399.99" fades in f40–70
  s.chartRefLineOpacity = interpolate(localF, [40, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Line draw f24–200
  s.chartRevealProgress = interpolate(localF, [24, 200], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Amber dots sequentially pop f120–210 — DP-5 has 7 points < $399.99
  // (indices 4..10). Spread across 90 frames.
  const amberDotsFloat = interpolate(localF, [120, 210], [0, 7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.chartAmberDotsVisible = Math.floor(amberDotsFloat);

  // Final price label "$349.99" f200–220
  s.chartFinalLabelOpacity = interpolate(localF, [200, 220], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Monitor caption chip f210–240
  s.chartCaptionOpacity = interpolate(localF, [210, 240], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return s;
}

export const SHOT_06: ShotDirector = {
  id: "shot06",
  startF: ACT_III_SHOT_OFFSETS.shot06,
  durationF: SHOT_06_DURATION_F,
  computeFrame,
};
