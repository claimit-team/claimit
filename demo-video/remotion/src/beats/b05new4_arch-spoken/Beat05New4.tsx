// Beat 05 NEW4 — ARCHITECTURE (production cut: accelerated + spoken subtitles).
// 2940f / 49s. Same structure & visuals as Beat05New3, with three changes:
//   1. ACCELERATED 0–26s — tighter dwells between agent reveals, a continuous
//      Claim→draft→Sent flow (no Sent dwell), and a shortened pan-to-Assistant
//      bridge. The MCP cadence (D1/D2/D3) and endgame keep v3's pace, just
//      time-shifted ~7s earlier. Net ~56s → ~49s.
//   2. TITLE — IntroTitle now reads "The System Behind It" (same styling).
//   3. CAPTIONS — the 4 top "keynote callouts" and the 5 old burned subtitles
//      are gone, replaced by ONE clean layer of 13 conversational BeatSubtitles
//      (verbatim, VO-aligned). The gradient section titles ("Grounded by open
//      MCP servers", "Built on Google Cloud + ✨ Gemini") are kept.
//
// Camera = transform on the arch wrapper (transformOrigin 960,540).
// ──────────────────────────────────────────────────────────────────────────
import { Send, UploadCloud } from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { GEMINI_GRADIENT_TEXT, GeminiSpark, GOOGLE_SANS } from "../../new-video/brand";
import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { useReveal } from "../../polish/RevealCard";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";
import { COLOR, TYPE } from "../../shots/_shared/tokens";
import { McpCard } from "./McpCard";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const NW = 170;
const NH = 100;
const UP = { x: 185, y: 380 };
const ING = { x: 545, y: 380 };
const MON = { x: 925, y: 380 };
const CLM = { x: 1305, y: 380 };
const SCHED = { x: 925, y: 255 };
const SENT = { x: 1530, y: 380 };
const MONGO = { x: 925, y: 650 };
const ASST = { x: 1790, y: 380 };
const DIV_X = 1640;
const PHX_NODE = { x: 1300, y: 720 };
const ES_NODE = { x: 1720, y: 560 };
const BORDER = "1px solid rgba(15,20,25,0.10)";
const SHADOW = "0 6px 18px rgba(15,20,25,0.08)";
const cardBase = {
  position: "absolute" as const,
  backgroundColor: colors.bg.surface,
  border: BORDER,
  boxShadow: SHADOW,
  borderRadius: 16,
  fontFamily: FONT_STACK_TEXT,
};
const GEM = staticFile("brandlogos/googlegemini.svg");
const BRAND_BLUE = colors.brand.primary; // #27466E
const AMBER = colors.semantic.warning; // #F59E0B — Elasticsearch accent
const LAVENDER = "#8B83B0"; // muted "observability, not data" line color

// MCP reveal frames — each MCP's card + node + lines key off the same beat.
// Shifted ~7s earlier than v3 by the accelerated front half.
const D1 = 1740; // MongoDB MCP
const D2 = 1950; // Elasticsearch
const D3 = 2160; // Arize Phoenix
const WIRE_DELAY = 30; // lines draw 30f after the card + node land

const BADGE_SRC: Record<string, string> = {
  mongo: "brandlogos/mongodb.svg",
  phoenix: "brandlogos/phoenix.png",
  elastic: "brandlogos/elasticsearch.svg",
};
const BadgeChip: React.FC<{ kind: string }> = ({ kind }) => (
  <div
    style={{
      width: 22,
      height: 22,
      borderRadius: 6,
      backgroundColor: colors.bg.surface,
      border: BORDER,
      boxShadow: "0 1px 3px rgba(15,20,25,0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Img
      src={staticFile(BADGE_SRC[kind])}
      style={{ width: 13, height: 13, objectFit: "contain" }}
    />
  </div>
);

// ── Intro section title — big+centered, then shrinks to a fixed top-center header.
const IntroTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 50], [0, 1], { ...C });
  const top = interpolate(frame, [150, 210], [486, 28], { ...C, easing: easings.easeInOut });
  const fsEnter = interpolate(frame, [0, 60], [64, 104], { ...C, easing: easings.sharpOut });
  const fsShrink = interpolate(frame, [150, 210], [104, 34], { ...C, easing: easings.easeInOut });
  const fontSize = Math.min(fsEnter, fsShrink);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        textAlign: "center",
        opacity,
        fontFamily: FONT_STACK_TEXT,
        fontWeight: 700,
        fontSize,
        letterSpacing: -1.5,
        lineHeight: 1,
        color: BRAND_BLUE,
      }}
    >
      The System Behind It
    </div>
  );
};

const Node: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  fromFrame: number;
  title: string;
  sub?: string;
  topIcon?: React.ReactNode;
  gemini?: boolean;
  badges?: string[];
}> = ({ x, y, w, h, fromFrame, title, sub, topIcon, gemini, badges }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        ...cardBase,
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        padding: 12,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 5,
        textAlign: "center",
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
        transformOrigin: "center",
      }}
    >
      {gemini && (
        <Img
          src={GEM}
          style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, opacity: 0.78 }}
        />
      )}
      {topIcon}
      <span
        style={{
          fontSize: topIcon ? 12 : 16,
          fontWeight: topIcon ? 600 : 700,
          color: topIcon ? colors.text.muted : colors.text.dark,
          lineHeight: 1.25,
        }}
      >
        {title}
      </span>
      {sub ? (
        <span style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.3 }}>{sub}</span>
      ) : null}
      {badges ? (
        <div
          style={{
            position: "absolute",
            bottom: 7,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {badges.map((b) => (
            <BadgeChip key={b} kind={b} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const HArrow: React.FC<{ x1: number; x2: number; y: number; fromFrame: number }> = ({
  x1,
  x2,
  y,
  fromFrame,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [fromFrame, fromFrame + 14], [0, 1], {
    ...C,
    easing: easings.easeOut,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: x1,
        top: y - 1,
        width: (x2 - x1) * p,
        height: 2,
        backgroundColor: colors.text.muted,
        opacity: 0.55 * Math.min(1, p * 3),
      }}
    >
      {p > 0.92 && (
        <div
          style={{
            position: "absolute",
            right: -1,
            top: -3,
            width: 0,
            height: 0,
            borderTop: "4px solid transparent",
            borderBottom: "4px solid transparent",
            borderLeft: `6px solid ${colors.text.muted}`,
          }}
        />
      )}
    </div>
  );
};

// ── Small event label above an arrow. Same style across all 4 arrows.
const ArrowLabel: React.FC<{
  x1: number;
  x2: number;
  y: number;
  label: string;
  fromFrame: number;
}> = ({ x1, x2, y, label, fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: (x1 + x2) / 2,
        top: y - 16,
        transform: `translate(-50%, -50%) translateY(${r.translateY.toFixed(1)}px)`,
        opacity: r.opacity,
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 999,
        padding: "2px 9px",
        fontFamily: FONT_STACK_TEXT,
        fontSize: 11,
        fontWeight: 600,
        color: BRAND_BLUE,
        whiteSpace: "nowrap",
        boxShadow: "0 2px 6px rgba(15,20,25,0.05)",
      }}
    >
      {label}
    </div>
  );
};

const Pill: React.FC<{
  x: number;
  y: number;
  label: string;
  fromFrame: number;
  withIcon?: boolean;
}> = ({ x, y, label, fromFrame, withIcon }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
        opacity: r.opacity,
        display: "flex",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 999,
        padding: "4px 12px",
        fontFamily: FONT_STACK_TEXT,
        fontSize: 12,
        fontWeight: 600,
        color: colors.brand.primary,
        whiteSpace: "nowrap",
      }}
    >
      {withIcon && (
        <Img src={staticFile("brandlogos/googlepubsub.svg")} style={{ width: 13, height: 13 }} />
      )}
      {label}
    </div>
  );
};

const FieldChip: React.FC<{ x: number; y: number; label: string; fromFrame: number }> = ({
  x,
  y,
  label,
  fromFrame,
}) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, 0) translateY(${r.translateY.toFixed(1)}px)`,
        opacity: r.opacity,
        fontFamily: FONT_STACK_TEXT,
        fontSize: 13,
        fontWeight: 500,
        color: colors.text.dark,
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 999,
        padding: "4px 14px",
        boxShadow: "0 3px 10px rgba(15,20,25,0.06)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
};

// ── "Sent" destination at the end of the claim arrow.
const SentCard: React.FC<{ x: number; y: number; fromFrame: number }> = ({ x, y, fromFrame }) => {
  const r = useReveal(fromFrame);
  const w = 120;
  const h = 98;
  return (
    <div
      style={{
        ...cardBase,
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        padding: 10,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
        textAlign: "center",
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
        transformOrigin: "center",
      }}
    >
      <Send size={26} color={BRAND_BLUE} strokeWidth={2} aria-hidden="true" />
      <span style={{ fontSize: 14, fontWeight: 700, color: colors.text.dark }}>Sent</span>
      <span style={{ fontSize: 11, color: colors.text.muted }}>to Costco</span>
    </div>
  );
};

const TechItem: React.FC<{ logo: string; name: string; fromFrame: number }> = ({
  logo,
  name,
  fromFrame,
}) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        width: 185,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
      }}
    >
      <Img
        src={staticFile(`brandlogos/${logo}`)}
        style={{ height: 38, maxWidth: 92, objectFit: "contain" }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: colors.text.dark,
          fontFamily: FONT_STACK_TEXT,
          textAlign: "center",
        }}
      >
        {name}
      </span>
    </div>
  );
};

const BuiltOnTitle: React.FC<{ fromFrame: number; top?: number }> = ({ fromFrame, top = 645 }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px)`,
        fontFamily: GOOGLE_SANS,
        fontSize: 32,
        letterSpacing: "-0.3px",
      }}
    >
      <span style={{ fontWeight: 600, color: colors.text.dark }}>Built on Google Cloud +</span>
      <GeminiSpark size={30} />
      <span style={{ fontWeight: 700, ...GEMINI_GRADIENT_TEXT }}>Gemini</span>
    </div>
  );
};

// ── Pre-MCP section title (forked from peer Scene09Sponsors' header). Reveals
//    after the camera settles; rides up with the cards in Phase E.
const PreMcpTitle: React.FC<{ fromFrame: number }> = ({ fromFrame }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [fromFrame, fromFrame + 30], [0, 1], {
    ...C,
    easing: easings.easeOut,
  });
  const slide = interpolate(frame, [fromFrame, fromFrame + 30], [16, 0], {
    ...C,
    easing: easings.easeOut,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 510,
        textAlign: "center",
        opacity,
        transform: `translateY(${slide.toFixed(1)}px)`,
      }}
    >
      <div style={{ ...TYPE.DISPLAY_S, fontSize: 50, color: COLOR.INK }}>
        Grounded by open MCP servers
      </div>
      <div style={{ ...TYPE.SUB, fontSize: 28, marginTop: 14 }}>
        <span style={{ color: COLOR.MUTE }}>How our </span>
        <span style={{ ...GEMINI_GRADIENT_TEXT, fontFamily: GOOGLE_SANS, fontWeight: 600 }}>
          Gemini
        </span>
        <span style={{ color: COLOR.MUTE }}> agents pull real, live context</span>
      </div>
    </div>
  );
};

const FIELDS = ["Merchant", "Item", "Date", "Price"];
const TECH: { logo: string; name: string }[] = [
  { logo: "googlegemini.svg", name: "Gemini" },
  { logo: "googlecloud.svg", name: "Google ADK" },
  { logo: "googlepubsub.svg", name: "Pub/Sub" },
  { logo: "googlecloud.svg", name: "Cloud Run" },
  { logo: "googlecloud.svg", name: "Cloud Scheduler" },
  { logo: "mongodb.svg", name: "MongoDB MCP" },
  { logo: "elasticsearch.svg", name: "Elasticsearch" },
  { logo: "phoenix.png", name: "Arize Phoenix" },
  { logo: "gmail.svg", name: "Gmail" },
];

const ScheduleArrow: React.FC<{ fromFrame: number }> = ({ fromFrame }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [fromFrame, fromFrame + 14], [0, 1], {
    ...C,
    easing: easings.easeOut,
  });
  const y1 = SCHED.y + 16;
  const y2 = MON.y - NH / 2 - 4;
  return (
    <div
      style={{
        position: "absolute",
        left: SCHED.x - 1,
        top: y1,
        width: 2,
        height: (y2 - y1) * p,
        backgroundColor: colors.text.muted,
        opacity: 0.55 * Math.min(1, p * 3),
      }}
    >
      {p > 0.92 && (
        <div
          style={{
            position: "absolute",
            bottom: -1,
            left: -3,
            width: 0,
            height: 0,
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: `6px solid ${colors.text.muted}`,
          }}
        />
      )}
    </div>
  );
};

const GeminiOcrLabel: React.FC<{ x: number; y: number; fromFrame: number }> = ({
  x,
  y,
  fromFrame,
}) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, 0) translateY(${r.translateY.toFixed(1)}px)`,
        opacity: r.opacity,
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: FONT_STACK_TEXT,
        fontSize: 12,
        color: colors.text.muted,
        whiteSpace: "nowrap",
      }}
    >
      <Img src={GEM} style={{ width: 13, height: 13, opacity: 0.8 }} />
      Gemini read it (OCR)
    </div>
  );
};

const DRAFT = "Hello Costco, I purchased this item…";
const DraftSnippet: React.FC<{ x: number; y: number; fromFrame: number }> = ({
  x,
  y,
  fromFrame,
}) => {
  const frame = useCurrentFrame();
  const r = useReveal(fromFrame);
  const typeStart = fromFrame + 4;
  const typeEnd = typeStart + Math.ceil(DRAFT.length / 1.5); // ~1.5 chars/frame
  const chars = Math.max(
    0,
    Math.floor(interpolate(frame, [typeStart, typeEnd], [0, DRAFT.length], C)),
  );
  const typing = frame >= typeStart && frame < typeEnd + 22;
  const cursorOn = Math.floor(frame / 12) % 2 === 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 115,
        top: y,
        width: 230,
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px)`,
        fontFamily: FONT_STACK_TEXT,
        fontSize: 11,
        lineHeight: 1.45,
        color: colors.text.muted,
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 10,
        padding: 10,
        boxShadow: "0 4px 12px rgba(15,20,25,0.06)",
        minHeight: 36,
      }}
    >
      {DRAFT.slice(0, chars)}
      {typing && <span style={{ opacity: cursorOn ? 0.9 : 0, color: BRAND_BLUE }}>▌</span>}
    </div>
  );
};

// ── A single draw-on connection line (animates its end-point).
const Wire: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  dashed?: boolean;
  fromFrame: number;
}> = ({ x1, y1, x2, y2, color, width, dashed, fromFrame }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [fromFrame, fromFrame + 50], [0, 1], {
    ...C,
    easing: easings.sharpOut,
  });
  if (p <= 0) return null;
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x1 + (x2 - x1) * p}
      y2={y1 + (y2 - y1) * p}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dashed ? "4 7" : undefined}
      opacity={dashed ? 0.55 : 0.85}
    />
  );
};

// Agent bottom anchor points for the MCP wires (card bottom edge).
const AGENT_WIRES: { x: number; y: number }[] = [
  { x: ING.x, y: ING.y + NH / 2 },
  { x: MON.x, y: MON.y + NH / 2 },
  { x: CLM.x, y: CLM.y + NH / 2 },
  { x: ASST.x, y: ASST.y + 75 },
];

export const Beat05New4: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = easings.easeInOut;

  // ── Rolling camera (transformOrigin = viewport center 960,540). ──────────
  // 1.4 through the (accelerated) agent build, then ONE continuous eased move
  // (1320–1560f): recenter + scale-down (1.4→0.85) + lift into the upper half.
  const camScale = interpolate(frame, [0, 1320, 1560], [1.4, 1.4, 0.85], { ...C, easing: ease });
  const focusX = interpolate(
    frame,
    [0, 180, 350, 400, 540, 580, 760, 1020, 1140, 1320, 1560],
    [420, 420, ING.x, ING.x, MON.x, MON.x, CLM.x, 1480, ASST.x, ASST.x, 987],
    { ...C, easing: ease },
  );
  const camTx = camScale * (960 - focusX);
  const camTy = interpolate(frame, [0, 1320, 1560], [188, 188, -234], { ...C, easing: ease });

  // Assistant-sidecar divider (draws just before the Assistant lands).
  const dividerP = interpolate(frame, [1100, 1130], [0, 1], { ...C, easing: easings.easeOut });

  // Phase E — architecture fades out & drifts up; the MCP cards rise to take
  // its place; then the techstack reveals below.
  const archOpacity = interpolate(frame, [2400, 2540], [1, 0], { ...C, easing: easings.easeIn });
  const archDriftY = interpolate(frame, [2420, 2580], [0, -80], { ...C, easing: ease });
  const cardRiseY = interpolate(frame, [2420, 2580], [0, -310], { ...C, easing: ease });
  const globalFade = interpolate(frame, [2850, 2940], [1, 0], { ...C });

  return (
    <HookAtmosphere>
      <AbsoluteFill style={{ opacity: globalFade }}>
        {/* ═════ ARCHITECTURE (fades out + drifts up in Phase E) ═════ */}
        <AbsoluteFill
          style={{ opacity: archOpacity, transform: `translateY(${archDriftY.toFixed(1)}px)` }}
        >
          <IntroTitle />
          <AbsoluteFill
            style={{
              transform: `translate(${camTx.toFixed(1)}px, ${camTy.toFixed(1)}px) scale(${camScale.toFixed(4)})`,
              transformOrigin: "960px 540px",
            }}
          >
            <svg
              aria-hidden="true"
              width={1920}
              height={1080}
              style={{ position: "absolute", inset: 0 }}
            >
              {/* Assistant-sidecar divider (kept). */}
              <line
                x1={DIV_X}
                y1={455 - 305 * dividerP}
                x2={DIV_X}
                y2={455 + 305 * dividerP}
                stroke={colors.text.muted}
                strokeWidth={1}
                strokeDasharray="2 6"
                opacity={0.4 * Math.min(1, dividerP * 3)}
              />

              {/* D1 — MongoDB MCP → all 4 agents (solid blue). */}
              {AGENT_WIRES.map((a) => (
                <Wire
                  key={`mongo-${a.x}`}
                  x1={MONGO.x}
                  y1={MONGO.y - 42}
                  x2={a.x}
                  y2={a.y}
                  color={BRAND_BLUE}
                  width={2.5}
                  fromFrame={D1 + WIRE_DELAY}
                />
              ))}
              {/* D2 — Elasticsearch → Assistant only (solid amber). */}
              <Wire
                x1={ES_NODE.x}
                y1={ES_NODE.y - 30}
                x2={ASST.x}
                y2={ASST.y + 75}
                color={AMBER}
                width={2}
                fromFrame={D2 + WIRE_DELAY}
              />
              {/* D3 — Arize Phoenix → all 4 agents (dashed lavender). */}
              {AGENT_WIRES.map((a) => (
                <Wire
                  key={`phx-${a.x}`}
                  x1={PHX_NODE.x}
                  y1={PHX_NODE.y - 34}
                  x2={a.x}
                  y2={a.y}
                  color={LAVENDER}
                  width={1.5}
                  dashed
                  fromFrame={D3 + WIRE_DELAY}
                />
              ))}
            </svg>

            <HArrow x1={UP.x + 55} x2={ING.x - NW / 2} y={UP.y} fromFrame={300} />
            <HArrow x1={ING.x + NW / 2} x2={MON.x - NW / 2} y={ING.y} fromFrame={480} />
            <HArrow x1={MON.x + NW / 2} x2={CLM.x - NW / 2} y={MON.y} fromFrame={700} />
            <HArrow x1={CLM.x + NW / 2} x2={SENT.x - 60} y={CLM.y} fromFrame={850} />
            <ScheduleArrow fromFrame={500} />

            <ArrowLabel
              x1={UP.x + 55}
              x2={ING.x - NW / 2}
              y={UP.y}
              label="receipt.uploaded"
              fromFrame={306}
            />
            <ArrowLabel
              x1={ING.x + NW / 2}
              x2={MON.x - NW / 2}
              y={ING.y}
              label="purchase.ingested"
              fromFrame={486}
            />
            <ArrowLabel
              x1={MON.x + NW / 2}
              x2={CLM.x - NW / 2}
              y={MON.y}
              label="price.dropped"
              fromFrame={706}
            />
            <ArrowLabel
              x1={CLM.x + NW / 2}
              x2={SENT.x - 60}
              y={CLM.y}
              label="claim.sent"
              fromFrame={856}
            />

            <Node
              x={UP.x}
              y={UP.y}
              w={110}
              h={110}
              fromFrame={180}
              title="Upload"
              topIcon={
                <UploadCloud
                  size={30}
                  color={colors.brand.primary}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              }
            />
            <Node
              x={ING.x}
              y={ING.y}
              w={NW}
              h={NH}
              fromFrame={360}
              title="ingest-agent"
              sub="extract"
              gemini
              badges={["mongo", "phoenix"]}
            />
            <Node
              x={MON.x}
              y={MON.y}
              w={NW}
              h={NH}
              fromFrame={540}
              title="monitor-agent"
              sub="watch price"
              gemini
              badges={["mongo", "phoenix"]}
            />
            <Node
              x={CLM.x}
              y={CLM.y}
              w={NW}
              h={NH}
              fromFrame={760}
              title="claim-agent"
              sub="draft claim"
              gemini
              badges={["mongo", "phoenix"]}
            />
            <SentCard x={SENT.x} y={SENT.y} fromFrame={860} />
            <Node
              x={ASST.x}
              y={ASST.y}
              w={250}
              h={150}
              fromFrame={1140}
              title="assistant-agent"
              sub="answers your questions — not in the claim workflow"
              gemini
              badges={["mongo", "phoenix", "elastic"]}
            />

            {FIELDS.map((f, j) => (
              <FieldChip key={f} x={ING.x} y={478 + j * 40} label={f} fromFrame={380 + j * 8} />
            ))}
            <GeminiOcrLabel x={ING.x} y={478 + 4 * 40 + 6} fromFrame={420} />

            <Pill x={SCHED.x} y={SCHED.y} label="every 15 min" fromFrame={515} />

            <DraftSnippet x={CLM.x} y={CLM.y + 78} fromFrame={800} />

            {/* MCP NODES — each springs in synced with its intro card (Phase D). */}
            <Node
              x={MONGO.x}
              y={MONGO.y}
              w={300}
              h={84}
              fromFrame={D1}
              title="MongoDB MCP"
              sub="purchases · claims · policies"
            />
            <Node
              x={ES_NODE.x}
              y={ES_NODE.y}
              w={200}
              h={66}
              fromFrame={D2}
              title="Elasticsearch"
              sub="policy search"
              topIcon={
                <Img
                  src={staticFile("brandlogos/elasticsearch.svg")}
                  style={{ width: 20, height: 20, objectFit: "contain" }}
                />
              }
            />
            <Node
              x={PHX_NODE.x}
              y={PHX_NODE.y}
              w={210}
              h={70}
              fromFrame={D3}
              title="Arize Phoenix"
              sub="traces every step"
              topIcon={
                <Img
                  src={staticFile("brandlogos/phoenix.png")}
                  style={{ width: 20, height: 20, objectFit: "contain" }}
                />
              }
            />
          </AbsoluteFill>
        </AbsoluteFill>

        {/* ═════ MCP INTRO CARDS (lower half; rise into upper half in Phase E) ═════ */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${cardRiseY.toFixed(1)}px)`,
          }}
        >
          {/* Section title — lands after the camera settles, before MongoDB. */}
          <PreMcpTitle fromFrame={1620} />
          <McpCard
            x={180}
            top={650}
            w={480}
            fromFrame={D1}
            logoFile="mongodb.svg"
            name="MongoDB"
            purpose="The Assistant reads your live purchases and claims — straight from the database."
          />
          <McpCard
            x={1260}
            top={650}
            w={480}
            fromFrame={D2}
            logoFile="elasticsearch.svg"
            name="Elasticsearch"
            purpose="The Assistant searches every store's price-protection policy in seconds."
          />
          <McpCard
            x={720}
            top={650}
            w={480}
            fromFrame={D3}
            logoFile="phoenix.png"
            name="Arize Phoenix"
            purpose="Agents self-evaluate by reading their own reasoning traces."
          />
        </div>

        {/* ═════ TECHSTACK (Phase E — reveals in the vacated lower half) ═════ */}
        <BuiltOnTitle fromFrame={2580} top={690} />
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: 780,
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            rowGap: 28,
            columnGap: 14,
          }}
        >
          {TECH.map((t, i) => (
            <TechItem key={t.name} logo={t.logo} name={t.name} fromFrame={2620 + i * 6} />
          ))}
        </div>
      </AbsoluteFill>

      {/* ═════ SPOKEN SUBTITLES (13 lines — the single caption layer) ═════ */}
      <BeatSubtitle text="It feels simple. That's the point." fromFrame={0} durationFrames={180} />
      <BeatSubtitle
        text="Just upload your receipt. We'll handle the rest."
        fromFrame={180}
        durationFrames={180}
      />
      <BeatSubtitle
        text="Gemini reads the details, so you never have to."
        fromFrame={360}
        durationFrames={180}
      />
      <BeatSubtitle
        text="Then we keep watching the price — every 15 minutes."
        fromFrame={540}
        durationFrames={210}
      />
      <BeatSubtitle
        text="Price drops? Gemini drafts the claim. You just need to approve it."
        fromFrame={750}
        durationFrames={270}
      />
      <BeatSubtitle
        text="Need anything? Just ask. We're here when you need us."
        fromFrame={1140}
        durationFrames={180}
      />
      <BeatSubtitle
        text="Four Gemini-powered agents, quietly working together for you."
        fromFrame={1320}
        durationFrames={240}
      />
      <BeatSubtitle text="Now, behind the experience." fromFrame={1620} durationFrames={120} />
      <BeatSubtitle
        text="Your purchases stay live in MongoDB — ready whenever they're needed."
        fromFrame={1740}
        durationFrames={210}
      />
      <BeatSubtitle
        text="Elasticsearch finds the right store policy, right when it matters."
        fromFrame={1950}
        durationFrames={210}
      />
      <BeatSubtitle
        text="And Phoenix gives us a clear trace of every step the agents take."
        fromFrame={2160}
        durationFrames={240}
      />
      <BeatSubtitle text="Built on the stack we trust." fromFrame={2580} durationFrames={90} />
      <BeatSubtitle
        text="Ready in the background. The moment you need it."
        fromFrame={2670}
        durationFrames={180}
      />
    </HookAtmosphere>
  );
};
