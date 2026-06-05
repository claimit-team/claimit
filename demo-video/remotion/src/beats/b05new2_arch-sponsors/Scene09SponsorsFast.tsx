// FORK of src/new-video/scenes/Scene09Sponsors.tsx — trimmed to the first ~9s
// (heading + sub + the 3 MCP sponsor cards) for the scrolling bottom section of
// Beat05New2. Differences vs the peer source:
//   • no LightScene / Camera wrappers (it lives inside the beat's scroll feed);
//   • no footer techstack strip (Beat05New2 has its own techstack page below);
//   • the Arize Phoenix card uses OUR brandlogos/phoenix.png instead of peer's
//     Flame placeholder icon;
//   • timing is driven by a `startFrame` offset instead of the scene clock.
// Typography, colors, copy and the per-card entrance timing are preserved.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { GEMINI_GRADIENT_TEXT, GOOGLE_SANS } from "../../new-video/brand";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

interface Mcp {
  logo: { kind: "img"; file: string } | { kind: "phoenix" };
  name: string;
  purpose: string;
}

const MCPS: Mcp[] = [
  {
    logo: { kind: "img", file: "mongodb" },
    name: "MongoDB",
    purpose: "The Assistant reads your live purchases and claims — straight from the database.",
  },
  {
    logo: { kind: "img", file: "elasticsearch" },
    name: "Elasticsearch",
    purpose: "The Assistant searches every store's price-protection policy in seconds.",
  },
  {
    logo: { kind: "phoenix" },
    name: "Arize Phoenix",
    purpose: "Agents self-evaluate by reading their own reasoning traces.",
  },
];

const CARD_W = 520;
const GAP = 40;
const ROW_W = MCPS.length * CARD_W + (MCPS.length - 1) * GAP; // 1640
const ROW_X = (1920 - ROW_W) / 2; // 140
const CARD_TOP = 280;
const CARD_H = 404;

export const Scene09SponsorsFast: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame() - startFrame;
  const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

  const headOp = iv(frame, [8, 46], [0, 1]);
  const headY = iv(frame, [8, 46], [18, 0]);
  const subOp = iv(frame, [44, 84], [0, 1]);

  return (
    <AbsoluteFill>
      {/* Heading */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 130,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          fontSize: 50,
          color: COLOR.INK,
          opacity: headOp,
          transform: `translateY(${headY}px)`,
        }}
      >
        Grounded by open MCP servers
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 212,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 28,
          opacity: subOp,
        }}
      >
        <span style={{ color: COLOR.MUTE }}>How our </span>
        <span style={{ ...GEMINI_GRADIENT_TEXT, fontFamily: GOOGLE_SANS, fontWeight: 600 }}>
          Gemini
        </span>
        <span style={{ color: COLOR.MUTE }}> agents pull real, live context</span>
      </div>

      {/* MCP cards */}
      {MCPS.map((mcp, i) => {
        const x = ROW_X + i * (CARD_W + GAP);
        const at = 90 + i * 70;
        const op = iv(frame, [at, at + 32], [0, 1]);
        const ty = iv(frame, [at, at + 32], [22, 0]);
        return (
          <div
            key={mcp.name}
            style={{
              position: "absolute",
              left: x,
              top: CARD_TOP,
              width: CARD_W,
              height: CARD_H,
              borderRadius: 18,
              background: COLOR.WHITE,
              border: `1px solid ${COLOR.LINE}`,
              boxShadow: "0 24px 60px rgba(20,30,50,0.08)",
              padding: 40,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 22,
              opacity: op,
              transform: `translateY(${ty}px)`,
            }}
          >
            {/* Logo */}
            <div
              style={{
                height: 90,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {mcp.logo.kind === "img" ? (
                <Img
                  src={staticFile(`brandlogos/${mcp.logo.file}.svg`)}
                  alt={mcp.name}
                  style={{ height: 72, width: 72, objectFit: "contain" }}
                />
              ) : (
                <Img
                  src={staticFile("brandlogos/phoenix.png")}
                  alt={mcp.name}
                  style={{ height: 76, width: 76, objectFit: "contain" }}
                />
              )}
            </div>

            {/* Name + MCP chip */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ ...TYPE.SUB, fontSize: 30, fontWeight: 700, color: COLOR.INK }}>
                {mcp.name}
              </span>
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  background: COLOR.NAVY_50,
                  border: `1px solid ${COLOR.NAVY}`,
                  color: COLOR.NAVY,
                  fontFamily: TYPE.MICRO.fontFamily,
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                }}
              >
                MCP
              </span>
            </div>

            {/* Purpose */}
            <div
              style={{
                ...TYPE.SUB,
                fontSize: 24,
                lineHeight: 1.4,
                color: COLOR.BODY,
                textAlign: "center",
              }}
            >
              {mcp.purpose}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
