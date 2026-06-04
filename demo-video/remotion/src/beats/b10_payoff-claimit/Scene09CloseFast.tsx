// Fork of peer Scene09Close — ONLY the two-line reveal ("Your Money, Still
// Yours." + "We just make sure you get it."), preserved exactly (Phase A), plus
// a move-up + shrink (Phase B) so the lines become a small header while Beat10's
// ClaimIt lockup takes the center. Peer's shield/team/links/outOp/Camera dropped;
// src/new-video untouched.
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { DP3_TAGLINE } from "../../shots/_shared/data";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

// Phase B — move the two-line group up + shrink (it stays visible as a header).
const MOVE = [210, 282];

export const Scene09CloseFast: React.FC = () => {
  const frame = useCurrentFrame();

  // Phase A — peer's reveal (verbatim timing/easing/positions).
  const tagOp = iv(frame, [6, 54], [0, 1]);
  const trackVal = iv(frame, [6, 54], [-1.6, -2.6]);
  const tagY = iv(frame, [6, 54], [16, 0]);
  const lineOp = iv(frame, [90, 140], [0, 1]);

  // Phase B — group transform (up + shrink to ~65%), origin ≈ group center.
  const gTy = iv(frame, MOVE, [0, -250]);
  const gScale = iv(frame, MOVE, [1, 0.65]);

  return (
    <AbsoluteFill
      style={{
        transform: `translateY(${gTy.toFixed(1)}px) scale(${gScale.toFixed(4)})`,
        transformOrigin: "center 388px",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 300,
          textAlign: "center",
          ...TYPE.DISPLAY,
          color: COLOR.INK,
          letterSpacing: `${trackVal.toFixed(3)}px`,
          opacity: tagOp,
          transform: `translateY(${tagY}px)`,
        }}
      >
        {DP3_TAGLINE}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 446,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 30,
          color: COLOR.MUTE,
          opacity: lineOp,
        }}
      >
        We just make sure you get it.
      </div>
    </AbsoluteFill>
  );
};
