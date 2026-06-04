// Universal burned-in subtitle for all NEW beats — PROJECT LAW "subtitles always".
//
// The LAW's visual spec (Inter 500 / 32px / #FFA500 / dark pill / bottom 100px) is
// HARDCODED here on purpose: these values are mandated literally by the PROJECT LAW
// and must not drift with polish/tokens.ts. The legacy src/polish/Subtitle.tsx and
// the SUBTITLE token are intentionally left untouched (used by legacy code only).
//
// API: <BeatSubtitle text="…" fromFrame={n} durationFrames={n} />

import { interpolate, useCurrentFrame } from "remotion";

import { easings } from "./easings";

interface BeatSubtitleProps {
  /** Subtitle text — MUST match BEAT_SHEET v3.1 EN column verbatim. */
  text: string;
  /** Frame the subtitle appears (= VO start; LAW: in ≤ VO start + 4f). */
  fromFrame: number;
  /** How long it stays up, in frames (= VO duration). */
  durationFrames: number;
}

const FADE = 6; // 6-frame fade-in / fade-out per LAW

export const BeatSubtitle: React.FC<BeatSubtitleProps> = ({
  text,
  fromFrame,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const end = fromFrame + durationFrames;

  // Outside the window the subtitle is not mounted at all.
  if (frame < fromFrame || frame >= end) return null;

  const opacity = interpolate(
    frame,
    [fromFrame, fromFrame + FADE, end - FADE, end],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easings.easeOut },
  );

  // 8px slide-up over the fade-in window only.
  const slideY = interpolate(frame, [fromFrame, fromFrame + FADE], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeOut,
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 100,
        left: "50%",
        transform: `translateX(-50%) translateY(${slideY}px)`,
        fontFamily: "Inter, sans-serif",
        fontSize: 32,
        fontWeight: 500,
        color: "#FFA500",
        backgroundColor: "rgba(8, 12, 20, 0.72)",
        padding: "10px 20px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        letterSpacing: "-0.005em",
        lineHeight: 1.2,
        opacity,
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
};
