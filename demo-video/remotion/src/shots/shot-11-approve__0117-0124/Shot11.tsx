// SHOT 11 — You approve · 1:17–1:24 · 420 f · Act III · Light
// Full shell sharp. Camera eases back 1.030→1.000. Cursor moves to
// "Approve and send", clicks at f120. Dialog opens, cursor to "Send
// email", click f240. Status flips to Submitted, banner appears.

import { interpolate } from "remotion";

import { DP6_EMAIL_BODY, DP6_EMAIL_SUBJECT, DP8_ASSISTANT } from "../_shared/data";
import { ACT_III_SHOT_OFFSETS, SHOT_11_DURATION_F } from "../_shared/durations";
import { EASE_CAM, EASE_UI } from "../_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState, type ShotDirector } from "../_shared/types";

// BUG-5 (v3 review): cursor targets re-aimed to actually land on the
// real button geometry.
//
// IMPORTANT: cursor coordinates are NATIVE shell pixels (1664×1016
// pre-FIT), NOT canvas pixels — the Cursor component renders inside
// ClaimShellLayer's wrapper which lives in Stage's FIT-scaled inner.
//
// Approve button — the real ClaimHeader's "Approve and send" sits
// right-aligned in the 96-px header. Center ~ native (1500, 50).
const APPROVE_BTN = { x: 1500, y: 50 };
// Send-email button inside the BUG-6 dialog (centered at native
// (832, 508), max-width 384 native, footer bg at the bottom 64 px
// edge-to-edge). Send button is right-aligned in the footer.
const SEND_BTN = { x: 970, y: 596 };
// Cursor start — bottom-right of native shell, in-bounds.
const CURSOR_START = { x: 1620, y: 180 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();

  s.layers.claimShell = 1;
  s.focus = { draft: 1, evidence: 1, assistant: 1, fullSharp: true };

  s.draftSubjectChars = DP6_EMAIL_SUBJECT.length;
  s.draftBodyChars = DP6_EMAIL_BODY.length;
  s.assistantReplyChars = DP8_ASSISTANT.reply.length;

  // Camera ease back f0–60: 1.030 → 1.000
  s.cameraScale = interpolate(localF, [0, 60], [1.03, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_CAM,
  });

  // Cursor active throughout most of shot
  s.showCursor = localF >= 30 && localF <= 380;

  // Cursor → Approve button f60–110
  const tApprove = interpolate(localF, [60, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  let cx = lerp(CURSOR_START.x, APPROVE_BTN.x, tApprove);
  let cy = lerp(CURSOR_START.y, APPROVE_BTN.y, tApprove);

  // Cursor → Send button f180–230
  const tSend = interpolate(localF, [180, 230], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  if (localF >= 180) {
    cx = lerp(APPROVE_BTN.x, SEND_BTN.x, tSend);
    cy = lerp(APPROVE_BTN.y, SEND_BTN.y, tSend);
  }
  s.cursorX = cx;
  s.cursorY = cy;

  // Approve button hover f110+
  s.approveButtonHover = localF >= 110 && localF < 130;

  // Click presses at f120 and f240 (8f press)
  s.cursorPressed = (localF >= 120 && localF <= 128) || (localF >= 240 && localF <= 248);

  // Dialog open f130–155, close f250–275
  const dialogOpen = interpolate(localF, [130, 155], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const dialogClose = interpolate(localF, [250, 275], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.approveDialogOpacity = Math.min(dialogOpen, dialogClose);
  s.approveDialogRise = interpolate(localF, [130, 155], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Status flips to Submitted at f270
  s.claimSubmitted = localF >= 270;

  // Banner appears f280–310
  s.approveBannerOpacity = interpolate(localF, [280, 310], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Out: shell dims hard f400–420 to set up Shot 12 — pull this out of
  // layers (Shot 12 handles it via shellDimAmount).

  return s;
}

export const SHOT_11: ShotDirector = {
  id: "shot11",
  startF: ACT_III_SHOT_OFFSETS.shot11,
  durationF: SHOT_11_DURATION_F,
  computeFrame,
};
