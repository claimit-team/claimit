// SHOT 12 — The money comes back (HEART) · 1:24–1:32 · 480 f · Act III ·
// Light → dim → light. Shell dims to opacity 0.10 + blur 10px behind a
// hero "$50.00" that turns amber→green. 4.4s lock during the hold.
// Push-in #2: 1.000→1.030 f0–120, then locked.

import { interpolate } from "remotion";

import { DP6_EMAIL_BODY, DP6_EMAIL_SUBJECT, DP8_ASSISTANT } from "../_shared/data";
import { ACT_III_SHOT_OFFSETS, SHOT_12_DURATION_F } from "../_shared/durations";
import { EASE_CAM, EASE_UI } from "../_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState, type ShotDirector } from "../_shared/types";

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();

  // Shell stays mounted, but dimmed.
  s.layers.claimShell = 1;
  s.focus = { draft: 1, evidence: 1, assistant: 1, fullSharp: true };
  s.claimSubmitted = true;

  // Shell dim ramp f0–30 to ~0.10 opacity + 10px blur
  s.shellDimAmount = interpolate(localF, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  // Out: bg lifts back f390–480
  const bgLift = interpolate(localF, [390, 480], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.shellDimAmount = Math.min(s.shellDimAmount, bgLift);

  // Push-in #2: 1.000 → 1.030 f0–120, lock through hold, no return.
  s.cameraScale = interpolate(localF, [0, 120], [1.0, 1.03], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_CAM,
  });

  // Hero money overlay enabled throughout
  s.layers.moneyOverlay = interpolate(localF, [0, 30, 390, 480], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // The leading "−" fades out f60–70 (10f)
  s.moneyMinusOpacity = interpolate(localF, [60, 70], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Color crossfade amber→green f72–96
  s.moneyGreenT = interpolate(localF, [72, 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Scale breath 1.00 → 1.04 → 1.00 over f72–120
  if (localF < 72) s.moneyScale = 1.0;
  else if (localF < 96)
    s.moneyScale = interpolate(localF, [72, 96], [1.0, 1.04], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_UI,
    });
  else if (localF < 120)
    s.moneyScale = interpolate(localF, [96, 120], [1.04, 1.0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_UI,
    });
  else s.moneyScale = 1.0;

  // Green bloom pulse f72–120 (peaks at ~f96)
  s.moneyBloomIntensity = interpolate(localF, [72, 96, 120], [0, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Sub "Still yours." f96–126
  s.moneySubOpacity = interpolate(localF, [96, 126], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.moneySubY = interpolate(localF, [96, 126], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Out fade f390–480: number + sub fade
  const outFade = interpolate(localF, [390, 480], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.moneySubOpacity *= outFade;
  s.layers.moneyOverlay *= outFade;

  // Carry shell content state for the dim behind
  s.draftSubjectChars = DP6_EMAIL_SUBJECT.length;
  s.draftBodyChars = DP6_EMAIL_BODY.length;
  s.assistantReplyChars = DP8_ASSISTANT.reply.length;

  return s;
}

export const SHOT_12: ShotDirector = {
  id: "shot12",
  startF: ACT_III_SHOT_OFFSETS.shot12,
  durationF: SHOT_12_DURATION_F,
  computeFrame,
};
