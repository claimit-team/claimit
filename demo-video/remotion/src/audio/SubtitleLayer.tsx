// SubtitleLayer — Remotion-native subtitle overlay.
//
// Reads from VO_TIMING (the single source of truth) and only shows
// captions for VO segments flagged showSubtitle=true (9 of the 17 VOs).
// Per user direction the subtitle gains a 6-frame fade in/out instead
// of hard cut.
//
// Style: bottom safe-area, Inter 34 px medium, white on a 62% dark
// translucent pill (so the subtitle stays readable over light and
// dark scenes). CSS `text-wrap: balance` gives clean 2-line splits
// without manual line breaks.

import { interpolate, useCurrentFrame } from "remotion";

import { SUBTITLE_FADE_F, VO_TIMING } from "./timing";

const SUBTITLES = VO_TIMING.filter((vo) => vo.showSubtitle);

export const SubtitleLayer: React.FC = () => {
  const frame = useCurrentFrame();

  // At most one subtitle is visible per frame (VO windows don't
  // overlap), but iterate so we always pick up the right one.
  const active = SUBTITLES.find(
    (s) => frame >= s.startF - SUBTITLE_FADE_F && frame <= s.endF + SUBTITLE_FADE_F,
  );
  if (!active) return null;

  const opacity = interpolate(
    frame,
    [active.startF - SUBTITLE_FADE_F, active.startF, active.endF, active.endF + SUBTITLE_FADE_F],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 80,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.42,
          color: "#FFFFFF",
          textAlign: "center",
          textWrap: "balance",
          background: "rgba(8, 12, 20, 0.62)",
          padding: "12px 28px",
          borderRadius: 10,
          maxWidth: 1440,
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
          // letter-spacing keeps Inter readable at this scale
          letterSpacing: "-0.1px",
        }}
      >
        {active.text}
      </span>
    </div>
  );
};
