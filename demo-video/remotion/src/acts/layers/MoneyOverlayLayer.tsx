// MoneyOverlayLayer — Shot 12's hero overlay. "−$50.00" amber →
// "$50.00" green with a single scale breath and a green bloom.
//
// BUG-7 (v3 review): this component no longer lives inside Stage's
// FIT-scaled inner. Its parent in ActIII_Stage is a canvas-space
// <AbsoluteFill display=flex justifyContent=center alignItems=center>
// wrapper, so the rendered content is centered at canvas (960, 540)
// at its TRUE font sizes (no 0.92× downscale). This component
// therefore renders a centered column with no absolute positioning —
// the wrapper does the centering.

import { DP10_MONEY_OVERLAY } from "../../shots/_shared/data";
import { COLOR, TYPE } from "../../shots/_shared/tokens";
import type { Act3FrameState } from "../../shots/_shared/types";

export const MoneyOverlayLayer: React.FC<{ state: Act3FrameState }> = ({ state }) => {
  // Color crossfade AMBER (#F59E0B = 245,158,11) → GREEN (#1D7A3A = 29,122,58)
  const t = state.moneyGreenT;
  const r = Math.round(245 + (29 - 245) * t);
  const g = Math.round(158 + (122 - 158) * t);
  const b = Math.round(11 + (58 - 11) * t);
  const moneyColor = `rgb(${r}, ${g}, ${b})`;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 32,
      }}
    >
      {/* Green bloom pulse — sits behind the number, centered. */}
      {state.moneyBloomIntensity > 0.001 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 720,
            height: 480,
            marginLeft: -360,
            marginTop: -240,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(29,122,58,0.85) 0%, transparent 60%)",
            opacity: state.moneyBloomIntensity,
            filter: "blur(20px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      {/* Hero money number */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          transform: `scale(${state.moneyScale.toFixed(5)})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        <div
          style={{
            ...TYPE.MONEY,
            color: moneyColor,
            display: "inline-flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span
            style={{
              opacity: state.moneyMinusOpacity,
              display: "inline-block",
            }}
          >
            −
          </span>
          <span>{DP10_MONEY_OVERLAY.greenValue}</span>
        </div>
      </div>
      {/* "Still yours." sub */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          color: COLOR.GREEN,
          opacity: state.moneySubOpacity,
          transform: `translateY(${state.moneySubY}px)`,
        }}
      >
        {DP10_MONEY_OVERLAY.sub}
      </div>
    </div>
  );
};
