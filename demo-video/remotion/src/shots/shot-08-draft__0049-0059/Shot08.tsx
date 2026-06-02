// SHOT 08 — The draft writes itself · 0:49–0:59 · 600 f · Act III · Light
// DraftPane(email) typewriter. The substring "$50.00" must land at
// f470 ±10 → amber underline f470–488.
//
// BUG-4 (v3 review): Shot 7's entrance already pre-populates the
// draft with greeting + intro (the AI's v1 from 4 days ago). Shot 8
// dramatizes the SPECIFICS paragraph being written — typewriter
// runs from DP6_BODY_SEED_CHARS to MONEY_END across f30–f470, lands
// "$50.00" at the same target frame, and finishes the remainder
// (signoff) over f470–500.

import { interpolate } from "remotion";

import { DP6_BODY_SEED_CHARS, DP6_EMAIL_BODY, DP6_EMAIL_SUBJECT } from "../_shared/data";
import { ACT_III_SHOT_OFFSETS, SHOT_08_DURATION_F } from "../_shared/durations";
import { EASE_UI } from "../_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState, type ShotDirector } from "../_shared/types";

const SUBJECT_LEN = DP6_EMAIL_SUBJECT.length;
const BODY_LEN = DP6_EMAIL_BODY.length;
const MONEY_OFFSET = DP6_EMAIL_BODY.indexOf("$50.00");
const MONEY_END = MONEY_OFFSET + "$50.00".length;

// Typewriter cadence: from the SEED (already on screen at Shot 7's
// entrance) to MONEY_END over the 440-frame window f30–f470. Lands
// "$50.00" complete at f470.
const TYPEWRITER_START_F = 30;
const TYPEWRITER_MONEY_F = 470;
const SEED_TO_MONEY_CHARS = MONEY_END - DP6_BODY_SEED_CHARS;
const BODY_CHARS_PER_FRAME = SEED_TO_MONEY_CHARS / (TYPEWRITER_MONEY_F - TYPEWRITER_START_F);

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();

  // Layers + focus held from S7
  s.layers.claimShell = 1;
  s.focus = { draft: 1, evidence: 0, assistant: 0, fullSharp: false };
  s.cameraScale = 1.03;

  // Subject already complete from Shot 7's pre-populated seed. (The
  // shell's editBuffer effect re-syncs each frame so we just pin it.)
  s.draftSubjectChars = SUBJECT_LEN;

  // Body typewriter: starts at the SEED, advances at the cadence
  // tuned to land MONEY_END by f470, then finishes the signoff.
  let bodyChars: number;
  if (localF < TYPEWRITER_START_F) {
    bodyChars = DP6_BODY_SEED_CHARS;
  } else if (localF <= TYPEWRITER_MONEY_F) {
    bodyChars =
      DP6_BODY_SEED_CHARS + Math.floor((localF - TYPEWRITER_START_F) * BODY_CHARS_PER_FRAME);
  } else if (localF <= 500) {
    // After money lands, finish remaining body (signoff) over 30 f
    const remainAfterMoney = BODY_LEN - MONEY_END;
    const post = interpolate(localF, [470, 500], [0, remainAfterMoney], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    bodyChars = MONEY_END + Math.floor(post);
  } else {
    bodyChars = BODY_LEN;
  }
  s.draftBodyChars = Math.min(bodyChars, BODY_LEN);

  // Amber underline on "$50.00" — visible f470–488, then fades f488–500
  if (localF < 470) s.draftMoneyUnderlineOpacity = 0;
  else if (localF <= 488) s.draftMoneyUnderlineOpacity = 1;
  else
    s.draftMoneyUnderlineOpacity = interpolate(localF, [488, 500], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_UI,
    });

  return s;
}

export const SHOT_08: ShotDirector = {
  id: "shot08",
  startF: ACT_III_SHOT_OFFSETS.shot08,
  durationF: SHOT_08_DURATION_F,
  computeFrame,
};
