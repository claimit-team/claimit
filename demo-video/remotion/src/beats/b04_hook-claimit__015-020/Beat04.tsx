// Beat 04 — Hook · ClaimIt · 0:15-0:20 · 300f · HOOK
// "ClaimIt turns that paperwork into an AI workflow." — BEAT_SHEET v3.1 row 4.
//
// Narrative continuity: the 100 dots from Beat03 converge into the ClaimIt
// wordmark. Self-contained — re-renders the grid at f=0 (same math + same
// random() seeds as Beat03, so the 2 red dots match across the cut).
//
// Frame plan (HOOK_BUILD_SPEC Task 7):
//   0-5     100 dots at grid positions (2 red), atmosphere visible
//   6-35    dots converge to center (960,540), scale 1->0, per-dot offset
//           dotIndex*0.3 for a swarm effect (easeInOut)
//   30-55   ClaimIt wordmark springs in (scale 0.85->1, opacity 0->1)
//   55-260  logo holds; subtle breath
//   260-290 logo fade-out (easeIn)
//   290-300 atmosphere only

import {
  AbsoluteFill,
  Audio,
  interpolate,
  random,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { easings } from "../../polish/easings";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";

const TEXT = "ClaimIt turns that paperwork into an AI workflow.";
const VO_START = 30;
const VO_DURATION = 212; // vo_b04.mp3 = 3.53s
const CENTER_X = 960;
const CENTER_Y = 540;

const dotX = (c: number) => 798 + c * 36;
const dotY = (r: number) => 298 + r * 36;

export const Beat04: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Same deterministic red dots as Beat03.
  const r1 = Math.floor(random("beat3-row1") * 6) + 2;
  const c1 = Math.floor(random("beat3-col1") * 6) + 2;
  let r2 = Math.floor(random("beat3-row2") * 6) + 2;
  let c2 = Math.floor(random("beat3-col2") * 6) + 2;
  if (r1 === r2 && c1 === c2) {
    r2 = ((r2 + 2) % 8) + 2;
  }
  const isRed = (r: number, c: number) =>
    (r === r1 && c === c1) || (r === r2 && c === c2);

  // Logo spring (starts at f30).
  const logoSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const logoScaleBase = interpolate(logoSpring, [0, 1], [0.85, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const breath = 1 + Math.sin(((frame - 55) * 2 * Math.PI) / 120) * 0.004;
  const logoScale = logoScaleBase * (frame >= 55 ? breath : 1);
  const logoOpacityIn = interpolate(logoSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoOpacityOut = interpolate(frame, [260, 290], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeIn,
  });
  const logoOpacity = (frame >= 30 ? 1 : 0) * logoOpacityIn * logoOpacityOut;

  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) cells.push({ r, c });
  }

  return (
    <HookAtmosphere>
      {/* Converging dots */}
      {cells.map(({ r, c }) => {
        const gx = dotX(c);
        const gy = dotY(r);
        const offset = (r * 10 + c) * 0.3;
        const progress = interpolate(frame, [6 + offset, 35 + offset], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easings.easeInOut,
        });
        const scale = 1 - progress;
        if (scale <= 0.001) return null; // fully converged -> gone

        const x = gx + (CENTER_X - gx) * progress;
        const y = gy + (CENTER_Y - gy) * progress;
        const color = isRed(r, c) ? colors.semantic.danger : colors.text.muted;

        return (
          <div
            key={`dot-${r}-${c}`}
            style={{
              position: "absolute",
              left: x - 8,
              top: y - 8,
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: color,
              opacity: isRed(r, c) ? 1 : 0.55,
              transform: `scale(${scale.toFixed(5)})`,
              transformOrigin: "center center",
            }}
          />
        );
      })}

      {/* ClaimIt wordmark */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            fontFamily: FONT_STACK_TEXT,
            fontSize: 128,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            color: colors.brand.primary,
            opacity: logoOpacity,
            transform: `scale(${logoScale.toFixed(5)})`,
          }}
        >
          ClaimIt
        </div>
      </AbsoluteFill>

      <Sequence name="vo_b04" from={VO_START}>
        <Audio src={staticFile("audio/vo/vo_b04.mp3")} />
      </Sequence>

      <BeatSubtitle text={TEXT} fromFrame={VO_START} durationFrames={VO_DURATION} />
    </HookAtmosphere>
  );
};
