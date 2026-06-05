// SHOT 01 — Cold open · 0:00–0:03 · 180 f · Act I · Dark
// Silence before the story. Black lifts to #0A0A0A; light barely
// breathes from 0.04 to 0.07.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { DarkScene } from "../_shared/DarkScene";
import { EASE_UI } from "../_shared/tokens";

export const Shot01: React.FC = () => {
  const frame = useCurrentFrame();

  // bg luminance: pure black for 1 frame, then lifts to #0A0A0A over f0–20.
  const liftedT = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const bgChannel = Math.round(0 + 10 * liftedT); // 0 → 10
  const bg = `rgb(${bgChannel}, ${bgChannel}, ${bgChannel})`;

  // directional light opacity: 0.04 → 0.07 over the full 180 f, EASE_UI.
  const lightOpacity = interpolate(frame, [0, 180], [0.04, 0.07], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return (
    <AbsoluteFill style={{ background: bg }}>
      <DarkScene
        lightOpacity={lightOpacity}
        // background already overridden above (rgb lift); DarkScene's own
        // #0A0A0A would clobber the rgb lift if not transparent.
        style={{ background: "transparent" }}
        noGrain={frame < 1}
      >
        {null}
      </DarkScene>
    </AbsoluteFill>
  );
};
