// SHOT 14 — Four ways · II (In-Store + Self-Service) · 1:52–2:11 · 1140 f ·
// Act III · Light. Same grid; focus moves to C then D. f960 = all-equal
// "full set" beat. Out f1080–1140 grid fades + scale 1.00→0.98.

import { interpolate } from "remotion";

import { ACT_III_SHOT_OFFSETS, SHOT_14_DURATION_F } from "../_shared/durations";
import { EASE_UI } from "../_shared/tokens";
import {
  type Act3FrameState,
  type Act3GridCellId,
  defaultAct3FrameState,
  type ShotDirector,
} from "../_shared/types";

function computeFrame(localF: number): Act3FrameState {
  const s = defaultAct3FrameState();
  s.layers.fourCardGrid = 1;
  s.cameraScale = 1.0;

  // Top label persists (held bright)
  s.gridTopLabelOpacity = 1;
  s.gridTopLabelY = 0;

  // In-Store (C) sharp f0–540
  const inStoreSharp = interpolate(localF, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  // Self-Service (D) sharp f560–960
  const selfSharp = interpolate(localF, [560, 584], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  // C steps down to 0.85 when D is sharp
  const inStoreToSeen = interpolate(localF, [560, 584], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // All-equal convergence f960–1080
  const convergeT = interpolate(localF, [960, 1080], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Out fade f1080–1140
  const outFade = interpolate(localF, [1080, 1140], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.layers.fourCardGrid = outFade;

  // Per-cell logic
  const cells: Act3GridCellId[] = [
    "email",
    "chat_script",
    "in_store_guide",
    "self_service_walkthrough",
  ];

  for (const cell of cells) {
    if (cell === "in_store_guide") {
      // Sharp/bright during beat 1, drops to 0.85 during beat 2, converges to 1
      const target = inStoreToSeen >= 0.999 ? 0.85 : 0.35 + (1 - 0.35) * inStoreSharp;
      s.gridCellOpacity[cell] = target + (1 - target) * convergeT;
      s.gridCellSharp[cell] = Math.max(inStoreSharp * (1 - inStoreToSeen), convergeT);
    } else if (cell === "self_service_walkthrough") {
      const target = 0.35 + (1 - 0.35) * selfSharp;
      s.gridCellOpacity[cell] = target + (1 - target) * convergeT;
      s.gridCellSharp[cell] = Math.max(selfSharp, convergeT);
    } else {
      // A, B: "seen" state 0.85; converge to 1
      const target = 0.85;
      s.gridCellOpacity[cell] = target + (1 - target) * convergeT;
      s.gridCellSharp[cell] = convergeT;
    }
  }

  // Footers
  s.gridCellFooterOpacity.email = 1;
  s.gridCellFooterOpacity.chat_script = 1;
  s.gridCellFooterOpacity.in_store_guide = interpolate(localF, [80, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  s.gridCellFooterOpacity.self_service_walkthrough = interpolate(localF, [640, 680], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Closing caption f1000–1030
  s.gridClosingOpacity =
    interpolate(localF, [1000, 1030], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_UI,
    }) * outFade;

  return s;
}

export const SHOT_14: ShotDirector = {
  id: "shot14",
  startF: ACT_III_SHOT_OFFSETS.shot14,
  durationF: SHOT_14_DURATION_F,
  computeFrame,
};
