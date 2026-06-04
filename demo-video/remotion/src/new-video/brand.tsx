// Shared brand bits for the new video: the Gemini gradient spark, the
// Google Sans font stack, and the per-scene "Agent badge" that names the
// agent powering each step of the flow (Ingest / Monitor / Claim /
// Assistant) — all "powered by Gemini".

import { useId } from "react";

import { COLOR } from "../shots/_shared/tokens";

// Google Sans where available (falls back to the locally-served Inter in
// headless renders, since Google Sans is not a freely-distributable webfont).
export const GOOGLE_SANS = '"Google Sans", "Product Sans", Inter, system-ui, sans-serif';

// Google's blue → purple → coral Gemini gradient as a clip-text style.
export const GEMINI_GRADIENT_TEXT: React.CSSProperties = {
  backgroundImage: "linear-gradient(90deg, #4285F4 0%, #9B72CB 50%, #D96570 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
};

// The official Gemini 4-point spark, filled with the gradient (path from
// the simple-icons Google Gemini glyph). Unique gradient id per instance
// so multiple sparks on one frame don't collide.
export const GeminiSpark: React.FC<{ size?: number }> = ({ size = 28 }) => {
  const gid = `gem${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Gemini"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
        fill={`url(#${gid})`}
      />
    </svg>
  );
};

/**
 * Top-centered chip naming the agent powering the current step, e.g.
 * "✦ Ingest Agent · powered by Gemini". Lives in 1920×1080 canvas space
 * (sits in the top margin above the product window).
 */
export const AgentBadge: React.FC<{ name: string; opacity?: number; top?: number }> = ({
  name,
  opacity = 1,
  top = 22,
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top,
      display: "flex",
      justifyContent: "center",
      opacity,
      pointerEvents: "none",
    }}
  >
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 20px",
        borderRadius: 999,
        background: COLOR.WHITE,
        border: `1px solid ${COLOR.LINE}`,
        boxShadow: "0 10px 30px rgba(20,30,50,0.10)",
      }}
    >
      <GeminiSpark size={24} />
      <span
        style={{
          fontFamily: GOOGLE_SANS,
          fontSize: 23,
          fontWeight: 600,
          color: COLOR.INK,
          letterSpacing: "-0.3px",
        }}
      >
        {name}
      </span>
      <span
        style={{ width: 4, height: 4, borderRadius: "50%", background: COLOR.MUTE, opacity: 0.5 }}
      />
      <span style={{ fontFamily: GOOGLE_SANS, fontSize: 21, fontWeight: 500 }}>
        <span style={{ color: COLOR.MUTE }}>powered by </span>
        <span style={GEMINI_GRADIENT_TEXT}>Gemini</span>
      </span>
    </div>
  </div>
);
