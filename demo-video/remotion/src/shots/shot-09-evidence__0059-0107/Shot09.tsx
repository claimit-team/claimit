// SHOT 09 — The evidence · 0:59–1:07 · 480 f · Act III · Light
// Focus shifts Draft→blur, Evidence→sharp. Camera optional micro-drift
// 1.030→1.034.

import { interpolate } from "remotion";

import { DP6_EMAIL_BODY, DP6_EMAIL_SUBJECT } from "../_shared/data";
import { ACT_III_SHOT_OFFSETS, SHOT_09_DURATION_F } from "../_shared/durations";
import { EASE_CAM, EASE_UI } from "../_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState, type ShotDirector } from "../_shared/types";

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();

  s.layers.claimShell = 1;
  s.focus.fullSharp = false;

  // Focus shift f0–24: Draft 1→0, Evidence 0→1, Assistant stays 0.
  s.focus.draft = interpolate(localF, [0, 24], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.focus.evidence = interpolate(localF, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.focus.assistant = 0;

  // Camera micro-drift 1.030 → 1.034
  s.cameraScale = interpolate(localF, [0, 480], [1.03, 1.034], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_CAM,
  });

  // Carry forward draft state (subject + body fully typed by now)
  s.draftSubjectChars = DP6_EMAIL_SUBJECT.length;
  s.draftBodyChars = DP6_EMAIL_BODY.length;

  return s;
}

export const SHOT_09: ShotDirector = {
  id: "shot09",
  startF: ACT_III_SHOT_OFFSETS.shot09,
  durationF: SHOT_09_DURATION_F,
  computeFrame,
};
