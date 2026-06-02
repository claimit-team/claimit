// SHOT 17B — Powered by / tech wall · 2:47–2:54 · 420 f · Act IV · Dark
//
// REDESIGN-4b (v3 review · NEW): a 4×3 wordmark grid of the 12
// platform names. All-text rendering (Inter, neutral gray) — see plan
// §"Inventory" for why this beats a mixed simple-icons + text wall.
// The decision keeps the row uniformly weighted and avoids brand-
// asset licensing on the 3 missing icons (Cloud Run, Cloud Scheduler,
// ScraperAPI).
//
// Choreography:
//   f0–60   (1.0 s) — "Powered by" small-caps label fades in.
//   f60–180 (2.0 s) — grid rows reveal in a 3-row wave:
//                      row 1 f60–100, row 2 f100–140, row 3 f140–180.
//   f180–360 (3.0 s) — full grid held.
//   f360–420 (1.0 s) — fade out.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { DarkScene } from "../_shared/DarkScene";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

const GRID_ROWS: readonly (readonly string[])[] = [
  ["Google Cloud", "Gemini", "MongoDB", "Phoenix"],
  ["Cloud Run", "Pub/Sub", "Cloud Scheduler", "Elasticsearch"],
  ["Gmail", "ScraperAPI", "Next.js", "Vercel"],
];

const CELL_W = 280;
const CELL_H = 80;
const COL_GAP = 32;
const ROW_GAP = 24;

const CANVAS_W = 1920;
const TOP_LABEL_Y = 240;
const GRID_TOP_Y = 360;

export const Shot17b: React.FC = () => {
  const frame = useCurrentFrame();

  // "Powered by" label fade-in
  const labelOpacity = interpolate(frame, [0, 60], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Per-row stagger windows
  const rowReveals = [
    [60, 100], // row 1
    [100, 140], // row 2
    [140, 180], // row 3
  ];

  // Out fade f360–420
  const outFade = interpolate(frame, [360, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Grid geometry — total grid width = 4 cells + 3 gaps
  const gridW = 4 * CELL_W + 3 * COL_GAP;
  const gridLeft = (CANVAS_W - gridW) / 2;

  return (
    <DarkScene lightOpacity={0.05}>
      <AbsoluteFill style={{ opacity: outFade }}>
        {/* "Powered by" small-caps label */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: TOP_LABEL_Y,
            textAlign: "center",
            fontFamily: TYPE.MICRO.fontFamily,
            fontSize: 18,
            fontWeight: 500,
            color: COLOR.MUTE,
            letterSpacing: "2.4px",
            textTransform: "uppercase",
            opacity: labelOpacity,
          }}
        >
          Powered by
        </div>

        {/* Wordmark grid */}
        {GRID_ROWS.map((row, rowIdx) => {
          const [revealStart, revealEnd] = rowReveals[rowIdx];
          const rowOpacity = interpolate(frame, [revealStart, revealEnd], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_UI,
          });
          const rowY = GRID_TOP_Y + rowIdx * (CELL_H + ROW_GAP);
          return (
            <div
              key={row[0]}
              style={{
                position: "absolute",
                left: gridLeft,
                top: rowY,
                width: gridW,
                height: CELL_H,
                display: "flex",
                gap: COL_GAP,
                opacity: rowOpacity,
              }}
            >
              {row.map((brand) => (
                <div
                  key={brand}
                  style={{
                    width: CELL_W,
                    height: CELL_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: TYPE.SUB.fontFamily,
                    fontSize: 24,
                    fontWeight: 500,
                    color: "#9CA3AF", // neutral gray
                    letterSpacing: "-0.2px",
                    textAlign: "center",
                  }}
                >
                  {brand}
                </div>
              ))}
            </div>
          );
        })}
      </AbsoluteFill>
    </DarkScene>
  );
};
