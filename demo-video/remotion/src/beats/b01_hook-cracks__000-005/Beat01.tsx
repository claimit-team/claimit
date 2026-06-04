// Beat 01 — Hook · cracks · 0:00-0:05 · 300f · HOOK
// "Every year, money slips through the cracks." — BEAT_SHEET v3.1 row 1.
//
// Frame plan (HOOK_BUILD_SPEC Task 4):
//   0-5     atmosphere only
//   6-12    accent line draws center -> 600px (sharpOut), at y=648
//   12-55   text typewriter, 1 char/frame (43 chars), caret follows last char
//   55-240  hold; caret blinks 12 on / 12 off
//   240-260 line retracts both ends -> center (easeIn; spec said "sharpIn",
//           which is absent from polish/easings.ts, so easeIn is substituted)
//   260-290 text mask-wipes right->left (easeIn); caret goes with last char
//   290-300 atmosphere only

import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { easings } from "../../polish/easings";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";

const TEXT = "Every year, money slips through the cracks."; // 43 chars
const VO_START = 10;
const VO_DURATION = 170; // vo_b01.mp3 = 2.83s

const LINE_Y = 648;
const TEXT_BASELINE_Y = 600;

export const Beat01: React.FC = () => {
  const frame = useCurrentFrame();

  // Accent line: draw out f6-12, hold, retract f240-260.
  const lineWidth =
    frame < 240
      ? interpolate(frame, [6, 12], [0, 600], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easings.sharpOut,
        })
      : interpolate(frame, [240, 260], [600, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easings.easeIn,
        });

  // Typewriter: 1 char/frame across f12-55.
  const charsShown = Math.max(0, Math.min(TEXT.length, frame - 12));
  const shownText = TEXT.slice(0, charsShown);

  // Mask-wipe out right->left across f260-290.
  const clipRight = interpolate(frame, [260, 290], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeIn,
  });

  // Caret: solid while typing, blink during hold, gone once the wipe starts.
  const typing = frame >= 12 && frame < 55;
  const holding = frame >= 55 && frame < 260;
  const blinkOn = Math.floor((frame - 55) / 12) % 2 === 0;
  const caretVisible = typing || (holding && blinkOn);

  return (
    <HookAtmosphere>
      {/* Text + caret — centered, bottom edge at baseline, wiped on exit. */}
      <div
        style={{
          position: "absolute",
          top: TEXT_BASELINE_Y,
          left: "50%",
          transform: "translate(-50%, -100%)",
          display: "flex",
          alignItems: "flex-end",
          clipPath: `inset(0 ${clipRight}% 0 0)`,
          WebkitClipPath: `inset(0 ${clipRight}% 0 0)`,
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
            opacity: 0.94,
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
            opacity: caretVisible ? 0.94 : 0,
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
