// Beat 01 — Hook · cracks · 0:00-0:04 · 240f · HOOK
// "Every year, money slips through the cracks." — BEAT_SHEET v3.1 row 1.
//
// Retimed 2026-06-04 (HOOK restructure): 300f → 240f, with a SLOWER
// typewriter enter (0.5 char/frame) and a slower, softer fade-out exit.
//
// Frame plan (240f):
//   0-6      atmosphere only
//   6-15     accent line draws center -> 600px (sharpOut), slower than before
//   15-101   text typewriter, 0.5 char/frame (43 chars), caret follows last char
//   101-195  hold; caret blinks 12 on / 12 off
//   195-225  accent line retracts to center + text fades out (slower exit, ~30f)
//   225-240  atmosphere only

import { Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";

const TEXT = "Every year, money slips through the cracks."; // 43 chars
const VO_START = 15; // align VO + subtitle with the typewriter start
const VO_DURATION = 185; // subtitle window — ends ~f200 (vo_b01.mp3 ≈ 2.83s ≈ 170f, fits within 240f)

const LINE_Y = 648;
const TEXT_BASELINE_Y = 600;

const TYPE_START = 15;
const TYPE_END = 101; // 43 chars @ 0.5 char/frame from f15
const HOLD_END = 195;
const EXIT_END = 225;

export const Beat01: React.FC = () => {
  const frame = useCurrentFrame();

  // Accent line: draw out f6-15 (slower), hold, retract f195-225 (slower).
  const lineWidth =
    frame < HOLD_END
      ? interpolate(frame, [6, 15], [0, 600], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easings.sharpOut,
        })
      : interpolate(frame, [HOLD_END, EXIT_END], [600, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easings.easeIn,
        });

  // Typewriter: 0.5 char/frame across f15-101 (slower enter).
  const charsShown = Math.max(0, Math.min(TEXT.length, Math.floor((frame - TYPE_START) * 0.5)));
  const shownText = TEXT.slice(0, charsShown);

  // Soft fade-out exit f195-225 (replaces the old fast right->left wipe).
  const textOpacity = interpolate(frame, [HOLD_END, EXIT_END], [0.94, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeIn,
  });

  // Caret: solid while typing, blink during hold, gone once the exit starts.
  const typing = frame >= TYPE_START && frame < TYPE_END;
  const holding = frame >= TYPE_END && frame < HOLD_END;
  const blinkOn = Math.floor((frame - TYPE_END) / 12) % 2 === 0;
  const caretVisible = typing || (holding && blinkOn);

  return (
    <HookAtmosphere>
      {/* Text + caret — centered, bottom edge at baseline, fades on exit. */}
      <div
        style={{
          position: "absolute",
          top: TEXT_BASELINE_Y,
          left: "50%",
          transform: "translate(-50%, -100%)",
          display: "flex",
          alignItems: "flex-end",
          opacity: textOpacity,
        }}
      >
        <span
          style={{
            fontFamily: FONT_STACK_TEXT,
            fontSize: 88,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            color: colors.text.dark,
            whiteSpace: "pre",
          }}
        >
          {shownText}
        </span>
        <span
          style={{
            width: 3,
            height: 72,
            marginLeft: 6,
            marginBottom: 8,
            backgroundColor: colors.text.dark,
            opacity: caretVisible ? 1 : 0,
          }}
        />
      </div>

      {/* Accent line, just below the text baseline. */}
      <div
        style={{
          position: "absolute",
          top: LINE_Y,
          left: "50%",
          transform: "translateX(-50%)",
          width: lineWidth,
          height: 1,
          backgroundColor: colors.text.dark,
          opacity: 0.6,
        }}
      />

      <Sequence name="vo_b01" from={VO_START}>
        <Audio src={staticFile("audio/vo/vo_b01.mp3")} />
      </Sequence>

      <BeatSubtitle text={TEXT} fromFrame={VO_START} durationFrames={VO_DURATION} />
    </HookAtmosphere>
  );
};
