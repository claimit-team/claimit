// PILLAR 4 — CAMERA. Animated transform wrapper. Translates + scales
// the wrapped children over a frame window with cinematic easing.

import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { EASING } from "./tokens";

interface CameraMoveProps {
  children: ReactNode;
  from: number;
  to: number;
  /** Translate from these xy (px) to (0,0). Default no translation. */
  fromTranslate?: { x?: number; y?: number };
  toTranslate?: { x?: number; y?: number };
  /** Scale from → to. Default 1 → 1. */
  fromScale?: number;
  toScale?: number;
  /** Easing curve. Default smooth (0.16, 1, 0.3, 1). */
  easing?: readonly [number, number, number, number];
  style?: CSSProperties;
}

export const CameraMove: React.FC<CameraMoveProps> = ({
  children,
  from,
  to,
  fromTranslate = { x: 0, y: 0 },
  toTranslate = { x: 0, y: 0 },
  fromScale = 1,
  toScale = 1,
  easing = EASING.smooth,
  style,
}) => {
  const frame = useCurrentFrame();
  const ease = (t: number) => bezier(t, easing);

  const tx = interpolate(frame, [from, to], [fromTranslate.x ?? 0, toTranslate.x ?? 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const ty = interpolate(frame, [from, to], [fromTranslate.y ?? 0, toTranslate.y ?? 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const scale = interpolate(frame, [from, to], [fromScale, toScale], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`,
        transformOrigin: "center center",
        willChange: "transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

function bezier(t: number, [_x1, y1, _x2, y2]: readonly [number, number, number, number]): number {
  const it = 1 - t;
  return 3 * it * it * t * y1 + 3 * it * t * t * y2 + t * t * t;
}
