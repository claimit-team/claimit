// Beat 03 — Hook · two percent · 0:10-0:15 · 300f · HOOK  (hero data-viz beat)
// "Only two out of a hundred ever get it back." — BEAT_SHEET v3.1 row 3.
//
// 10x10 dot grid builds in, holds, then 2 deterministic dots punch red with a
// halo glow; a chart caption reinforces the data point. The orange PROJECT-LAW
// subtitle (bottom) and the white chart caption (under grid) coexist.
//
// Frame plan (HOOK_BUILD_SPEC Task 6):
//   0-5     atmosphere only
//   6-50    grid builds; dot (r,c) starts at 6 + r*4 + c*2, 8f opacity+scale
//   50-70   pause — 100 identical dots hold
//   70-85   2 red dots scale 1.0 -> 1.4 (sharpOut)
//   80-90   red dots color neutral[500] -> semantic.danger
//   85-110  halo glow fades in behind red dots (r=24, danger @ 20%)
//   95      VO starts
//   110-130 caption "2 out of 100" typewriter at y=660
//   130-270 hold; red dots pulse
//   270-290 fade out (red dots ~3f slower)
//   290-300 atmosphere only

import {
  Audio,
  interpolate,
  interpolateColors,
  random,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { easings } from "../../polish/easings";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";

const TEXT = "Only two out of a hundred ever get it back.";
const VO_START = 95;
const VO_DURATION = 162; // vo_b03.mp3 = 2.69s
const CAPTION = "2 out of 100";

// dot center x/y for a (row,col): grid is 10x10, dot 16px, spacing 36px,
// bounding box 340px, centered at (960, 460).
const dotX = (c: number) => 798 + c * 36; // 960 - 170 + c*36 + 8
const dotY = (r: number) => 298 + r * 36; // 460 - 170 + r*36 + 8

export const Beat03: React.FC = () => {
  const frame = useCurrentFrame();

  // Deterministic red dots — inner 6x6 (rows/cols 2..7).
  const r1 = Math.floor(random("beat3-row1") * 6) + 2;
  const c1 = Math.floor(random("beat3-col1") * 6) + 2;
  let r2 = Math.floor(random("beat3-row2") * 6) + 2;
  let c2 = Math.floor(random("beat3-col2") * 6) + 2;
  if (r1 === r2 && c1 === c2) {
    r2 = ((r2 + 2) % 8) + 2;
  }
  const isRed = (r: number, c: number) =>
    (r === r1 && c === c1) || (r === r2 && c === c2);

  const haloFade = interpolate(frame, [85, 97], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeOut,
  });
  const redExit = interpolate(frame, [273, 290], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeIn,
  });
  const normalExit = interpolate(frame, [270, 290], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeIn,
  });

  const captionChars = Math.max(0, Math.min(CAPTION.length, frame - 110));
  const captionExit = interpolate(frame, [270, 290], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easings.easeIn,
  });
  const captionOpacity = (frame >= 110 ? 1 : 0) * 0.94 * captionExit;

  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) cells.push({ r, c });
  }

  return (
    <HookAtmosphere>
      {/* Halos behind the red dots */}
      {cells
        .filter(({ r, c }) => isRed(r, c))
        .map(({ r, c }) => (
          <div
            key={`halo-${r}-${c}`}
            style={{
              position: "absolute",
              left: dotX(c) - 24,
              top: dotY(r) - 24,
              width: 48,
              height: 48,
              borderRadius: "50%",
              backgroundColor: colors.semantic.danger,
              opacity: 0.2 * haloFade * redExit,
            }}
          />
        ))}

      {/* Dot grid */}
      {cells.map(({ r, c }) => {
        const startF = 6 + r * 4 + c * 2;
        const build = interpolate(frame, [startF, startF + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easings.easeOut,
        });
        const red = isRed(r, c);

        let scale = build;
        let color: string = colors.text.muted;
        let opacity = build * normalExit * 0.55;

        if (red) {
          scale =
            frame < 70
              ? build
              : frame < 85
                ? interpolate(frame, [70, 85], [1, 1.4], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easings.sharpOut,
                  })
                : frame < 130
                  ? 1.4
                  : 1.4 + Math.sin(((frame - 110) * 2 * Math.PI) / 60) * 0.05;
          color =
            frame < 80
              ? colors.text.muted
              : interpolateColors(Math.min(frame, 90), [80, 90], [
                  colors.text.muted,
                  colors.semantic.danger,
                ]);
          opacity =
            build *
            redExit *
            (frame < 80
              ? 0.55
              : interpolate(frame, [80, 90], [0.55, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }));
        }

        return (
          <div
            key={`dot-${r}-${c}`}
            style={{
              position: "absolute",
              left: dotX(c) - 8,
              top: dotY(r) - 8,
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: color,
              opacity,
              transform: `scale(${scale.toFixed(5)})`,
              transformOrigin: "center center",
            }}
          />
        );
      })}

      {/* Chart caption under the grid */}
      <div
        style={{
          position: "absolute",
          top: 660,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: FONT_STACK_TEXT,
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          color: colors.text.dark,
          opacity: captionOpacity,
          whiteSpace: "pre",
        }}
      >
        {CAPTION.slice(0, captionChars)}
      </div>

      <Sequence name="vo_b03" from={VO_START}>
        <Audio src={staticFile("audio/vo/vo_b03.mp3")} />
      </Sequence>

      <BeatSubtitle text={TEXT} fromFrame={VO_START} durationFrames={VO_DURATION} />
    </HookAtmosphere>
  );
};
