// Burned-in subtitle, styled per STORYBOARD §Visual system. Inter Display
// 36px / weight 500, 95% opacity, lower-third (y=880), no plate.
//
// Subtitles fade in/out over short windows so they don't pop. Pair them
// with VO timing in the section composition.

import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { windowOpacity } from "./motion";
import { SUBTITLE } from "./tokens";

interface SubtitleProps {
  children: ReactNode;
  /** Frame the subtitle should fully appear. */
  from: number;
  /** Frame the subtitle should fully disappear. */
  to: number;
  /** Frames of fade-in/out at each edge. Default 12 (~200ms @60fps). */
  fade?: number;
  /** Override base color (default white). */
  color?: string;
  /** Override y position (default 880). */
  y?: number;
  /** Source citation line shown below the main subtitle, lower contrast. */
  source?: string;
  style?: CSSProperties;
}

export const Subtitle: React.FC<SubtitleProps> = ({
  children,
  from,
  to,
  fade = 12,
  color = "#FAFAFA",
  y,
  source,
  style,
}) => {
  const frame = useCurrentFrame();
  const opacity = windowOpacity(frame, from, to, fade);
  const top = y ?? SUBTITLE.y;

  if (opacity <= 0.001) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
        opacity: opacity * SUBTITLE.opacity,
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: "Inter Display, Inter, system-ui, sans-serif",
          fontWeight: SUBTITLE.weight,
          fontSize: SUBTITLE.size,
          letterSpacing: SUBTITLE.letterSpacing,
          color,
          textAlign: "center",
          textRendering: "geometricPrecision",
          WebkitFontSmoothing: "antialiased",
          // Subtle drop shadow opposite to the foreground color so the
          // subtitle stays legible across transitions where the
          // background is mid-fade between light and dark. Very small,
          // never reads as "glow."
          textShadow:
            color.toLowerCase() === "#000000" || color.toLowerCase() === "#0a0a0a"
              ? "0 1px 2px rgba(255,255,255,0.55), 0 0 6px rgba(255,255,255,0.4)"
              : "0 1px 2px rgba(0,0,0,0.55), 0 0 6px rgba(0,0,0,0.4)",
        }}
      >
        {children}
      </div>
      {source ? (
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 400,
            fontSize: 20,
            color,
            opacity: 0.6,
            textAlign: "center",
            marginTop: 4,
          }}
        >
          {source}
        </div>
      ) : null}
    </div>
  );
};
