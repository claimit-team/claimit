// Beat 02 — Hook · categories · 0:05-0:10 · 300f · HOOK
// "Refunds. Price protection. Rewards. Rebates." — BEAT_SHEET v3.1 row 2.
//
// Four Lucide icons (Receipt / Tag / Sparkle / Mail) draw on via stroke
// dash-offset, labels typewriter in under each. NO emoji — inline SVG paths.
//
// Icon draw-on uses SVG pathLength="1" normalization: stroke-dasharray=1 and
// stroke-dashoffset=(1 - progress) reveal each element 0->100% regardless of
// its true geometric length (so no per-icon path-length measurement needed).
//
// Frame plan (HOOK_BUILD_SPEC Task 5):
//   0-5    atmosphere only
//   6-20   icon 1 draws (14f) + label types
//   18-32  icon 2 + label   (+12f stagger)
//   30-44  icon 3 + label
//   42-56  icon 4 + label
//   60-240 hold; per-icon breathing scale
//   240-280 staggered fade-out (4f per pair)
//   280-300 atmosphere only

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

const TEXT = "Refunds. Price protection. Rewards. Rebates.";
const VO_START = 6;
const VO_DURATION = 234; // vo_b02.mp3 = 3.90s

type IconEl =
  | { t: "path"; d: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill: true };

interface IconDef {
  label: string;
  els: IconEl[];
}

// Lucide 24x24 stroke-width-2 paths (from lucide.dev).
const ICONS: IconDef[] = [
  {
    label: "Refunds", // Receipt
    els: [
      { t: "path", d: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" },
      { t: "path", d: "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" },
      { t: "path", d: "M12 17.5v-11" },
    ],
  },
  {
    label: "Price Protection", // Tag
    els: [
      {
        t: "path",
        d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
      },
      { t: "circle", cx: 7.5, cy: 7.5, r: 0.5, fill: true },
    ],
  },
  {
    label: "Rewards", // Sparkle
    els: [
      {
        t: "path",
        d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0Z",
      },
    ],
  },
  {
    label: "Rebates", // Mail
    els: [
      { t: "rect", x: 2, y: 4, w: 20, h: 16, rx: 2 },
      { t: "path", d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" },
    ],
  },
];

export const Beat02: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <HookAtmosphere>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            width: 1200,
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {ICONS.map((icon, i) => {
            const start = 6 + i * 12;
            const drawProgress = interpolate(frame, [start, start + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easings.easeOut,
            });
            const labelChars = Math.max(0, Math.min(icon.label.length, frame - start));
            const breath = 1 + Math.sin(((frame - 6 - i * 22) * 2 * Math.PI) / 90) * 0.005;
            const exit = interpolate(frame, [240 + i * 4, 264 + i * 4], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easings.easeIn,
            });
            const colOpacity = (frame >= start ? 1 : 0) * 0.94 * exit;
            const dashOffset = 1 - drawProgress;

            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static 4-item list
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 24,
                  width: 220,
                  opacity: colOpacity,
                }}
              >
                <svg
                  width={64}
                  height={64}
                  viewBox="0 0 24 24"
                  style={{ transform: `scale(${breath.toFixed(5)})`, overflow: "visible" }}
                >
                  {icon.els.map((el, j) => {
                    if (el.t === "circle") {
                      return (
                        <circle
                          // biome-ignore lint/suspicious/noArrayIndexKey: static
                          key={j}
                          cx={el.cx}
                          cy={el.cy}
                          r={el.r}
                          fill={colors.text.dark}
                          opacity={drawProgress}
                        />
                      );
                    }
                    const common = {
                      pathLength: 1,
                      fill: "none" as const,
                      stroke: colors.text.dark,
                      strokeWidth: 2,
                      strokeLinecap: "round" as const,
                      strokeLinejoin: "round" as const,
                      strokeDasharray: 1,
                      strokeDashoffset: dashOffset,
                    };
                    if (el.t === "rect") {
                      return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: static
                        <rect key={j} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} {...common} />
                      );
                    }
                    // biome-ignore lint/suspicious/noArrayIndexKey: static
                    return <path key={j} d={el.d} {...common} />;
                  })}
                </svg>
                <div
                  style={{
                    fontFamily: FONT_STACK_TEXT,
                    fontSize: 28,
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    color: colors.text.dark,
                    textAlign: "center",
                    whiteSpace: "pre",
                  }}
                >
                  {icon.label.slice(0, labelChars)}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      <Sequence name="vo_b02" from={VO_START}>
        <Audio src={staticFile("audio/vo/vo_b02.mp3")} />
      </Sequence>

      <BeatSubtitle text={TEXT} fromFrame={VO_START} durationFrames={VO_DURATION} />
    </HookAtmosphere>
  );
};
