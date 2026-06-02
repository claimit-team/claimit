// SHOT 13 — Four ways · I (Email + Chat) · 1:32–1:52 · 1200 f · Act III ·
// Light. Grid mounted (all four cells), focus sweeps A then B.

import { interpolate } from "remotion";

import { ACT_III_SHOT_OFFSETS, SHOT_13_DURATION_F } from "../_shared/durations";
import { EASE_UI } from "../_shared/tokens";
import {
  type Act3FrameState,
  type Act3GridCellId,
  defaultAct3FrameState,
  type ShotDirector,
} from "../_shared/types";

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();
  s.cameraScale = 1.0;

  // Grid fades up; shell fades out
  s.layers.claimShell = interpolate(localF, [0, 60], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.layers.fourCardGrid = interpolate(localF, [30, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Top label f0–36
  s.gridTopLabelOpacity = interpolate(localF, [0, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.gridTopLabelY = interpolate(localF, [0, 36], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Email "hero" cross-fade (centered → top-left grid position)
  s.emailHeroOpacity = interpolate(localF, [30, 70], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Cells fade in: A f40–90, B f60–120, C+D f60–120 but held at 0.35
  const allCellsBaseUp = interpolate(localF, [60, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const emailCellUp = interpolate(localF, [40, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Beat 1 focus: Email sharp f120–360 (others dim)
  const emailSharp = interpolate(localF, [80, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  // Beat 2: Email → "seen" (0.85), Chat sharp f400–660
  const chatSharp = interpolate(localF, [380, 420], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const emailToSeen = interpolate(localF, [380, 420], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Compute cell opacities and sharpness
  const cells: Act3GridCellId[] = [
    "email",
    "chat_script",
    "in_store_guide",
    "self_service_walkthrough",
  ];

  for (const cell of cells) {
    if (cell === "email") {
      const baseOp = emailCellUp;
      const op = emailToSeen >= 0.999 ? 0.85 : 1.0 * emailSharp + 0 * (1 - emailSharp);
      s.gridCellOpacity[cell] = Math.min(baseOp, op || 0.35);
      s.gridCellSharp[cell] = emailSharp * (1 - emailToSeen) + 0.5 * emailToSeen;
    } else if (cell === "chat_script") {
      const baseOp = allCellsBaseUp;
      let target = 0.35;
      if (chatSharp > 0) target = 0.35 + (1 - 0.35) * chatSharp;
      s.gridCellOpacity[cell] = baseOp * target;
      s.gridCellSharp[cell] = chatSharp;
    } else {
      // C and D held dim (0.35) until S14
      s.gridCellOpacity[cell] = allCellsBaseUp * 0.35;
      s.gridCellSharp[cell] = 0;
    }
  }

  // Footers
  s.gridCellFooterOpacity.email = interpolate(localF, [200, 240], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.gridCellFooterOpacity.chat_script = interpolate(localF, [520, 560], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Out: hand off to S14 — grid persists, no cross-fade here.

  return s;
}

export const SHOT_13: ShotDirector = {
  id: "shot13",
  startF: ACT_III_SHOT_OFFSETS.shot13,
  durationF: SHOT_13_DURATION_F,
  computeFrame,
};
