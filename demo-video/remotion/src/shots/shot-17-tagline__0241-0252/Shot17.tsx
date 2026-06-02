// SHOT 17 — Tagline reprise · 2:41–2:47 · 360 f · Act IV · Dark
//
// REDESIGN-4a (v3 review): trimmed from 660 f to 360 f so the new
// Shot 17B tech wall fits inside the same 1140 f closing-trio budget.
// Same tagline reveal — tracking tighten + slow light settle — but
// the long static hold is shortened.
//
// Timing (360 f / 6 s):
//   f0–48   reveal: opacity 0→1 + tracking −1.0 → −2.6 px (EASE_UI).
//   f48–300 hold.
//   f300–360 cross-dissolve out to Shot 17B.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DarkScene } from "../_shared/DarkScene";
import { DP3_TAGLINE } from "../_shared/data";
import { EASE_UI, TYPE } from "../_shared/tokens";

export const Shot17: React.FC = () => {
  const frame = useCurrentFrame();

  const taglineOpacity = interpolate(frame, [0, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const letterSpacing = interpolate(frame, [0, 48], [-1.0, -2.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Light settles 0.07 → 0.05 in the first 200 f.
  const lightOpacity = interpolate(frame, [0, 200], [0.07, 0.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Cross-dissolve out f300–360 to hand off to Shot 17B.
  const outFade = interpolate(frame, [300, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return (
    <DarkScene lightOpacity={lightOpacity}>
      <AbsoluteFill style={{ opacity: outFade }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 500 - 44,
            textAlign: "center",
            ...TYPE.DISPLAY,
            color: "#FFFFFF",
            opacity: taglineOpacity,
            letterSpacing: `${letterSpacing.toFixed(3)}px`,
          }}
        >
          {DP3_TAGLINE}
        </div>
      </AbsoluteFill>
    </DarkScene>
  );
};
