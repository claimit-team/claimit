// SHOT 10 — It explains, and it's traceable · 1:07–1:17 · 600 f · Act III · Light
// Focus shifts to Assistant. User bubble f60–80. Assistant streams f96–430.
// Tool line f440–470. Out widens to full shell f570–600 (sets up S11).

import { interpolate } from "remotion";

import { DP6_EMAIL_BODY, DP6_EMAIL_SUBJECT, DP8_ASSISTANT } from "../_shared/data";
import { ACT_III_SHOT_OFFSETS, SHOT_10_DURATION_F } from "../_shared/durations";
import { EASE_UI } from "../_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState, type ShotDirector } from "../_shared/types";

const REPLY_LEN = DP8_ASSISTANT.reply.length;

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();

  s.layers.claimShell = 1;
  s.focus.fullSharp = false;

  // Focus shift f0–24 to Assistant
  s.focus.draft = interpolate(localF, [0, 24], [0, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  s.focus.evidence = interpolate(localF, [0, 24], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.focus.assistant = interpolate(localF, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Out widens to full shell f570–600
  const widen = interpolate(localF, [570, 600], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.focus.draft = Math.max(s.focus.draft, widen);
  s.focus.evidence = Math.max(s.focus.evidence, widen);
  s.focus.assistant = Math.max(s.focus.assistant, widen);

  s.cameraScale = 1.03;

  s.draftSubjectChars = DP6_EMAIL_SUBJECT.length;
  s.draftBodyChars = DP6_EMAIL_BODY.length;

  // User bubble f60–80
  s.assistantUserBubbleOpacity = interpolate(localF, [60, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Stream f96–430
  s.assistantReplyChars = Math.floor(
    interpolate(localF, [96, 430], [0, REPLY_LEN], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  s.assistantStreaming = localF >= 96 && localF < 430;

  // Tool line f440–470
  s.assistantToolLineOpacity = interpolate(localF, [440, 470], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return s;
}

export const SHOT_10: ShotDirector = {
  id: "shot10",
  startF: ACT_III_SHOT_OFFSETS.shot10,
  durationF: SHOT_10_DURATION_F,
  computeFrame,
};
