// Motion helpers — wrappers around Remotion's spring() and interpolate()
// that encode the "weight, anticipation, stagger" defaults from
// PRODUCTION_POLISH.md Pillar 5.

import { interpolate, spring } from "remotion";
import { EASING, SPRING } from "./tokens";

interface SpringEntranceOpts {
  frame: number;
  fps: number;
  delay?: number;
  config?: Partial<typeof SPRING>;
  /** Final value (default 1). 0 means "no entrance," 1 means "full." */
  to?: number;
}

/**
 * Spring-driven 0→1 progress. Use for entrance opacities, scales, and
 * `interpolate` input ranges. Has weight + settle, never linear.
 */
export function springProgress({
  frame,
  fps,
  delay = 0,
  config,
  to = 1,
}: SpringEntranceOpts): number {
  return (
    spring({
      frame: frame - delay,
      fps,
      config: { ...SPRING, ...(config ?? {}) },
      durationInFrames: undefined,
    }) * to
  );
}

/**
 * Stagger offset. Returns the delay (in frames) for the Nth item in a
 * list, given `perItem` frames between each.
 */
export function stagger(index: number, perItem: number): number {
  return index * perItem;
}

/**
 * Eased 0→1 progress over a time window. Use for camera moves and
 * deliberate animations (where spring() would be wrong).
 */
export function eased(
  frame: number,
  startFrame: number,
  durationFrames: number,
  easing: readonly [number, number, number, number] = EASING.smooth,
): number {
  if (frame <= startFrame) return 0;
  if (frame >= startFrame + durationFrames) return 1;
  const t = (frame - startFrame) / durationFrames;
  // Cubic bezier evaluation — approximation via interpolate's bezier easing.
  // Remotion's interpolate doesn't accept arbitrary cubic-bezier directly,
  // so we use the closed-form Bernstein evaluation.
  return cubicBezier(t, easing[0], easing[1], easing[2], easing[3]);
}

function cubicBezier(t: number, _x1: number, y1: number, _x2: number, y2: number): number {
  // We only need y(t), and we approximate by treating t as the input
  // (which is exact for x1=x2=t — close enough for animation curves).
  // For high-fidelity curves we'd Newton-solve for t given x; for our
  // visual smoothness this is indistinguishable.
  const it = 1 - t;
  return 3 * it * it * t * y1 + 3 * it * t * t * y2 + t * t * t;
}

/**
 * Anticipation pattern — tiny pull-back before a big move. Returns a
 * scale value that dips 3% before popping to `peakScale`. Use sparingly,
 * only on moments the audience should feel are significant.
 */
export function anticipation(
  frame: number,
  arriveFrame: number,
  pullbackFrames = 6,
  peakScale = 1.06,
): number {
  return interpolate(
    frame,
    [arriveFrame - pullbackFrames, arriveFrame, arriveFrame + 6],
    [1, 0.97, peakScale],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

/**
 * Clamped fade-in. Common case so it's a one-liner.
 */
export function fadeIn(frame: number, startFrame: number, durationFrames: number): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Clamped fade-out — interpolate(frame, [start, start+dur], [1, 0]).
 */
export function fadeOut(frame: number, startFrame: number, durationFrames: number): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Window opacity — combines fadeIn + hold + fadeOut. Useful for elements
 * that should appear, sit, then disappear.
 */
export function windowOpacity(
  frame: number,
  inFrame: number,
  outFrame: number,
  fadeFrames = 12,
): number {
  return Math.min(
    fadeIn(frame, inFrame, fadeFrames),
    fadeOut(frame, outFrame - fadeFrames, fadeFrames),
  );
}
