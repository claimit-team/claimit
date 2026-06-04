// ─────────────────────────────────────────────────────────────────────────
// Cursor — orange virtual cursor primitive for the demo-interaction beats.
//
// Frame-driven (useCurrentFrame + interpolate; NO CSS transition/animation, so
// it's immune to the global JITTER GUARD in globals.css and renders
// deterministically at any seeked frame).
//
// API:
//   <Cursor
//     keyframes={[{frame:0,x:960,y:540},{frame:30,x:1500,y:66}]}  // px in 1920x1080
//     clicks={[{frame:34}]}                                        // click pulses
//   />
//
// - Position is piecewise-eased between successive keyframes (expo-out), held
//   flat before the first / after the last keyframe.
// - Each click emits an expanding ring pulse + a brief pointer "press" dip,
//   centered on the cursor tip at the click frame.
// - The pointer tip sits exactly at the (x,y) coordinate (SVG origin = tip).
// ─────────────────────────────────────────────────────────────────────────
import { Easing, interpolate, useCurrentFrame } from "remotion";

export type CursorKeyframe = { frame: number; x: number; y: number };
export type CursorClick = { frame: number };

const EASE = Easing.bezier(0.16, 1, 0.3, 1); // expo-out — "smooth as glass"
const PULSE_FRAMES = 22;
const PRESS_FRAMES = 7;

function valueAt(frame: number, kfs: CursorKeyframe[], pick: (k: CursorKeyframe) => number): number {
  if (kfs.length === 0) return 0;
  if (frame <= kfs[0].frame) return pick(kfs[0]);
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) return pick(last);
  for (let i = 0; i < kfs.length - 1; i += 1) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      return interpolate(frame, [a.frame, b.frame], [pick(a), pick(b)], {
        easing: EASE,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }
  return pick(last);
}

export const Cursor: React.FC<{
  keyframes: CursorKeyframe[];
  clicks?: CursorClick[];
  size?: number;
  color?: string;
}> = ({ keyframes, clicks = [], size = 30, color = "#FF7A00" }) => {
  const frame = useCurrentFrame();
  const x = valueAt(frame, keyframes, (k) => k.x);
  const y = valueAt(frame, keyframes, (k) => k.y);

  // Active click (the most recent one whose pulse window contains `frame`).
  const active = clicks
    .filter((c) => frame >= c.frame && frame <= c.frame + PULSE_FRAMES)
    .sort((a, b) => b.frame - a.frame)[0];

  let ring: { scale: number; opacity: number } | null = null;
  let press = 1;
  if (active) {
    const p = (frame - active.frame) / PULSE_FRAMES; // 0..1
    ring = {
      scale: interpolate(p, [0, 1], [0.4, 2.5], { extrapolateRight: "clamp" }),
      opacity: interpolate(p, [0, 1], [0.5, 0], { extrapolateRight: "clamp" }),
    };
    const pp = (frame - active.frame) / PRESS_FRAMES; // 0..1 over the press window
    if (pp >= 0 && pp <= 1) {
      // quick dip-and-recover: 1 → 0.82 → 1
      press = 1 - 0.18 * Math.sin(pp * Math.PI);
    }
  }

  const ringSize = size * 1.5;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 9999, pointerEvents: "none" }}>
      {ring ? (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: ringSize,
            height: ringSize,
            marginLeft: -ringSize / 2,
            marginTop: -ringSize / 2,
            borderRadius: "50%",
            border: `2.5px solid ${color}`,
            transform: `scale(${ring.scale})`,
            opacity: ring.opacity,
          }}
        />
      ) : null}
      <svg
        width={size}
        height={size * (24 / 18)}
        viewBox="0 0 18 24"
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `scale(${press})`,
          transformOrigin: "0 0",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
          overflow: "visible",
        }}
        aria-hidden
      >
        <path
          d="M0 0 L0 18 L4.8 13.6 L8 20.6 L10.7 19.3 L7.5 12.4 L13 12.4 Z"
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
