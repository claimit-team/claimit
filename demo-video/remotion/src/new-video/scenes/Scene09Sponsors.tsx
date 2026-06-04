// Scene 9 — Sponsors / MCP · 2:28–2:42 · 840f · light.
// Highlights the MCP servers the Gemini agents use, and what each is for
// (this is what the sponsor-judges award on):
//   • MongoDB MCP       — Assistant reads live purchases & claims
//   • Elasticsearch MCP — Assistant searches store policies
//   • Arize Phoenix MCP — agents self-evaluate from their own traces
// Footer keeps the Google Cloud + Gemini credit.

import { Flame } from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { GEMINI_GRADIENT_TEXT, GeminiSpark, GOOGLE_SANS } from "../brand";
import { S9_SPONSORS_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

interface Mcp {
  logo: { kind: "img"; file: string } | { kind: "icon" };
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
    logo: { kind: "icon" },
    name: "Arize Phoenix",
    purpose: "Agents self-evaluate by reading their own reasoning traces.",
  },
];

// Full tech stack (the original strip — keeps Vercel / Next.js / Pub/Sub /
// Gmail visible alongside the highlighted MCP sponsors).
const TECH: { file: string; label: string }[] = [
  { file: "googlegemini", label: "Gemini" },
  { file: "googlecloud", label: "Google Cloud" },
  { file: "mongodb", label: "MongoDB" },
  { file: "elasticsearch", label: "Elasticsearch" },
  { file: "googlepubsub", label: "Pub/Sub" },
  { file: "gmail", label: "Gmail API" },
  { file: "nextdotjs", label: "Next.js" },
  { file: "vercel", label: "Vercel" },
];

const CARD_W = 520;
const GAP = 40;
const ROW_W = MCPS.length * CARD_W + (MCPS.length - 1) * GAP; // 1640
const ROW_X = (1920 - ROW_W) / 2; // 140
const CARD_TOP = 280;
const CARD_H = 404;

export const Scene09Sponsors: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.01} startF={0} endF={S9_SPONSORS_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  const headOp = iv(frame, [8, 46], [0, 1]);
  const headY = iv(frame, [8, 46], [18, 0]);
  const subOp = iv(frame, [44, 84], [0, 1]);
  const footOp = iv(frame, [560, 610], [0, 1]);
  const outOp = iv(frame, [S9_SPONSORS_F - 40, S9_SPONSORS_F], [1, 0]);

  return (
    <AbsoluteFill style={{ opacity: outOp }}>
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
                  // simple-icons SVGs ship a 24×24 viewBox with no width/height,
                  // so give explicit (square) dimensions or they collapse.
                  style={{ height: 72, width: 72, objectFit: "contain" }}
                />
              ) : (
                <Flame size={76} color="#E0533D" strokeWidth={1.8} />
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

      {/* Footer — full tech stack ("Built on Google Cloud + Gemini") */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 726,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: footOp,
        }}
      >
        <span style={{ fontFamily: GOOGLE_SANS, fontSize: 24, fontWeight: 600, color: COLOR.MUTE }}>
          Built on Google Cloud +
        </span>
        <GeminiSpark size={26} />
        <span
          style={{
            fontFamily: GOOGLE_SANS,
            fontSize: 24,
            fontWeight: 700,
            ...GEMINI_GRADIENT_TEXT,
          }}
        >
          Gemini
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 786,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 34,
          opacity: footOp,
        }}
      >
        {TECH.map((t) => (
          <div
            key={t.file}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              width: 108,
            }}
          >
            <Img
              src={staticFile(`brandlogos/${t.file}.svg`)}
              alt={t.label}
              style={{ height: 40, width: 40, objectFit: "contain" }}
            />
            <span style={{ ...TYPE.MICRO, fontSize: 15, color: COLOR.BODY, textAlign: "center" }}>
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
