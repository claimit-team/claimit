// SHOT 07 — Into the workspace · 0:44–0:49 · 300 f · Act III · Light
// PriceChart fades out, ClaimShell fades in (already mounted at Act-frame 0).
// Camera push-in 1.015 → 1.030. Focus tightens to Draft (others blur+dim).

import { interpolate } from "remotion";

import { DP6_BODY_SEED_CHARS, DP6_EMAIL_SUBJECT } from "../_shared/data";
import { ACT_III_SHOT_OFFSETS, SHOT_07_DURATION_F } from "../_shared/durations";
import { EASE_CAM, EASE_UI } from "../_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState, type ShotDirector } from "../_shared/types";

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();

  // Chart tail-out f0–30
  s.layers.priceChart = interpolate(localF, [0, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // BUG-4: pre-populate subject + seed body so the shell's entrance
  // is logically consistent with the "v1 · AI draft · 4 days ago"
  // version metadata. Shot 8's typewriter takes over from the seed.
  s.draftSubjectChars = DP6_EMAIL_SUBJECT.length;
  s.draftBodyChars = DP6_BODY_SEED_CHARS;

  // Shell in f0–48
  s.layers.claimShell = interpolate(localF, [0, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Camera 1.015 → 1.030 across f0–300
  s.cameraScale = interpolate(localF, [0, 300], [1.015, 1.03], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_CAM,
  });

  // Focus: tighten to Draft over f48–96
  s.focus.fullSharp = false;
  s.focus.draft = 1;
  s.focus.evidence = interpolate(localF, [48, 96], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.focus.assistant = s.focus.evidence;

  return s;
}

export const SHOT_07: ShotDirector = {
  id: "shot07",
  startF: ACT_III_SHOT_OFFSETS.shot07,
  durationF: SHOT_07_DURATION_F,
  computeFrame,
};
