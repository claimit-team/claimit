// SHOT 04 — The light · logo · tagline · 0:18–0:28 · 600 f · Act II ·
// Dark → (sets up Light)
//
// v3 review REDESIGN-1: the convergence particles + bloomed core
// were jarring + felt cheap. New choreography (logo-first, slogan-
// second, no white-bloom particles):
//   f0–60   (1.0 s) — DarkScene held, nothing on screen (beat of
//                     silence replacing the 3 s of particles).
//   f60–150 (1.5 s) — single subtle central glow eases up to a
//                     barely-perceptible 0.10 opacity. Felt, not seen.
//   f120–180 (1.0 s) — "ClaimIt" word fades in centered (scale
//                     0.94 → 1.00, opacity 0 → 1), white, DISPLAY 88
//                     px, letter-spacing −2.6px.
//   f180–210 (0.5 s) — LOGO ALONE held. The pause that lets the brand
//                     own the frame before the promise lands.
//   f210–270 (1.0 s) — "Your Money, Still Yours." enters underneath:
//                     opacity 0 → 1 + tracking −1.0 → −2.6 px.
//   f270–520 (4.2 s) — both held.
//   f520–600 (1.3 s) — dark→light luminance ramp + tagline/logo
//                     fade. Hands off to Shot 5.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DarkScene } from "../_shared/DarkScene";
import { DP3_TAGLINE } from "../_shared/data";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

const CENTER_X = 960;
const LOGO_Y = 440; // y position of logo's vertical center on canvas
const SLOGAN_Y = 560;

export const Shot04: React.FC = () => {
  const frame = useCurrentFrame();

  // Dark→light bg luminance ramp f520–600
  const bgT = interpolate(frame, [520, 600], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const bgR = Math.round(10 + (249 - 10) * bgT);
  const bgG = Math.round(10 + (250 - 10) * bgT);
  const bgB = Math.round(10 + (251 - 10) * bgT);
  const bg = `rgb(${bgR}, ${bgG}, ${bgB})`;

  // grain fades 0.05 → 0.02 over the full shot
  const grainOpacity = interpolate(frame, [0, 600], [0.05, 0.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle central glow — peaks at ~0.10 opacity, replaces the white
  // bloom core entirely. Just enough to imply "something is here."
  const glowOpacity = interpolate(frame, [60, 150, 270, 520], [0, 0.1, 0.08, 0.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Logo: fade in f120–180 with a small scale-up.
  const logoOpacity = interpolate(frame, [120, 180], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const logoScale = interpolate(frame, [120, 180], [0.94, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Slogan: enters f210–270 with tracking tighten −1.0 → −2.6 px.
  const sloganOpacity = interpolate(frame, [210, 270], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const sloganTracking = interpolate(frame, [210, 270], [-1.0, -2.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Both fade out f540–600 during the dark→light handoff.
  const lockedFade = interpolate(frame, [540, 600], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Logo/slogan colors invert during the dark→light ramp so they
  // stay readable through the bg transition.
  const isLight = bgT > 0.5;
  const fgLogo = isLight ? COLOR.NAVY : "#FFFFFF";
  const fgSlogan = isLight ? COLOR.INK : "#FFFFFF";

  // Directional light dims as the bg lifts (the dark canvas's
  // light source goes away as the world goes white).
  const lightOpacity =
    interpolate(frame, [0, 520], [0.07, 0.07], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    (1 - bgT);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <DarkScene style={{ background: "transparent" }} lightOpacity={lightOpacity} noGrain={true}>
        {null}
      </DarkScene>

      {/* Manual grain so we can ramp its opacity directly. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: grainOpacity,
          pointerEvents: "none",
          mixBlendMode: "overlay",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 0.5px, transparent 0.6px)",
          backgroundSize: "3px 3px",
        }}
        aria-hidden
      />

      {/* Subtle central glow — single static radial gradient, no
          per-particle math. Replaces the prior bloom core. */}
      <div
        style={{
          position: "absolute",
          left: CENTER_X - 320,
          top: LOGO_Y - 320,
          width: 640,
          height: 640,
          background:
            "radial-gradient(circle, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 35%, transparent 70%)",
          opacity: glowOpacity * (1 - bgT * 0.8),
          filter: "blur(8px)",
          pointerEvents: "none",
        }}
        aria-hidden
      />

      {/* Logo */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: LOGO_Y - 56,
          textAlign: "center",
          opacity: logoOpacity * lockedFade,
          transform: `scale(${logoScale.toFixed(5)})`,
          transformOrigin: "center center",
          ...TYPE.DISPLAY,
          color: fgLogo,
          letterSpacing: "-2.6px",
        }}
      >
        ClaimIt
      </div>

      {/* Slogan */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: SLOGAN_Y - 28,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          color: fgSlogan,
          opacity: sloganOpacity * lockedFade,
          letterSpacing: `${sloganTracking.toFixed(3)}px`,
        }}
      >
        {DP3_TAGLINE}
      </div>
    </AbsoluteFill>
  );
};
