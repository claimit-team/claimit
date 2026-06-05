// Beat 05 NEW3 — ARCHITECTURE (one-at-a-time MCP reveal + arch-fade endgame).
// 3380f / ~56s. Builds on Beat05New2, refining the MCP rhythm per feedback:
//   • Phase 0–A (agent build: Upload→Ingest→Monitor→Claim→Assistant with the
//     rolling pan, callouts, badge stacks) is UNCHANGED from Beat05New2.
//   • Phase B: brief hold zoomed out enough to see all 4 agents (no MCP yet).
//   • Phase C: zoom further (→0.85) and lift the diagram into the UPPER half,
//     freeing the lower half for the MCP intro cards.
//   • Phase D: the 3 MCPs reveal ONE AT A TIME. Each is a synced 3-beat event:
//     the intro CARD (lower half) + the architecture NODE (upper half) spring
//     in together, then THAT MCP's connection lines draw on.
//       D1 MongoDB MCP  → solid blue,   node bottom-center, card lower-left
//       D2 Elasticsearch→ solid amber,  node right,         card lower-right
//       D3 Arize Phoenix→ dashed lavender, node right-center, card lower-center
//   • Phase E: the architecture (agents + nodes + wires) fades out while the 3
//     cards rise into the upper half; then "Built on Google Cloud + Gemini." +
//     the 9-logo techstack reveal in the vacated lower half.
//   • Phase F: hold on [3 cards + techstack]. Phase G: everything fades out.
//
// Removed (carried from Beat05New2): PhoenixBand, the old subtle dashed
// Mongo→agent / Mongo→Phoenix connectors. Phoenix uses our png, not Flame.
// Camera = transform on the arch wrapper (transformOrigin 960,540).
// ──────────────────────────────────────────────────────────────────────────
import { Send, UploadCloud } from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { useReveal } from "../../polish/RevealCard";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";
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
const D1 = 2160; // MongoDB MCP
const D2 = 2380; // Elasticsearch
const D3 = 2600; // Arize Phoenix
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

// ── Intro section title: "How it works?" — big+centered, then shrinks to a
//    fixed top-center section header.
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
      How it works?
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
        textAlign: "center",
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px)`,
        fontFamily: FONT_STACK_TEXT,
        fontWeight: 700,
        fontSize: 32,
        letterSpacing: -0.5,
        color: BRAND_BLUE,
      }}
    >
      Built on Google Cloud + Gemini.
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

// ── Overlay keynote caption (screen-fixed, top-center). One per agent moment.
const Callout: React.FC<{ text: string; fromFrame: number; toFrame: number }> = ({
  text,
  fromFrame,
  toFrame,
}) => {
  const frame = useCurrentFrame();
  if (frame < fromFrame || frame > toFrame) return null;
  const opacity = interpolate(
    frame,
    [fromFrame, fromFrame + 16, toFrame - 16, toFrame],
    [0, 1, 1, 0],
    { ...C, easing: easings.easeInOut },
  );
  const y = interpolate(frame, [fromFrame, fromFrame + 20], [12, 0], {
    ...C,
    easing: easings.easeOut,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 150,
        textAlign: "center",
        opacity,
        transform: `translateY(${y.toFixed(1)}px)`,
        fontFamily: FONT_STACK_TEXT,
        fontSize: 46,
        fontWeight: 400,
        letterSpacing: "-0.012em",
        color: colors.text.dark,
        pointerEvents: "none",
      }}
    >
      {text}
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

export const Beat05New3: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = easings.easeInOut;

  // ── Rolling camera (transformOrigin = viewport center 960,540). ──────────
  // 1.4 through the agent build → 1.0 (Phase B, all 4 visible) → 0.85 lifted
  // into the upper half (Phase C) so the lower half is free for the MCP cards.
  const camScale = interpolate(frame, [0, 1820, 1920, 2000, 2160], [1.4, 1.4, 1.0, 1.0, 0.85], {
    ...C,
    easing: ease,
  });
  const focusX = interpolate(
    frame,
    [0, 240, 460, 720, 760, 940, 980, 1180, 1220, 1440, 1560, 1820, 1920, 2160],
    [420, 420, ING.x, ING.x, MON.x, MON.x, CLM.x, CLM.x, 1480, 1480, ASST.x, ASST.x, 987, 987],
    { ...C, easing: ease },
  );
  const camTx = camScale * (960 - focusX);
  const camTy = interpolate(frame, [0, 1820, 1920, 2000, 2160], [188, 188, -20, -20, -234], {
    ...C,
    easing: ease,
  });

  // Assistant-sidecar divider (kept). Old dashed connectors + PhoenixBand removed.
  const dividerP = interpolate(frame, [1545, 1575], [0, 1], { ...C, easing: easings.easeOut });

  // Phase E — architecture fades out & drifts up; the MCP cards rise to take
  // its place; then the techstack reveals below.
  const archOpacity = interpolate(frame, [2820, 2960], [1, 0], { ...C, easing: easings.easeIn });
  const archDriftY = interpolate(frame, [2840, 3020], [0, -80], { ...C, easing: ease });
  const cardRiseY = interpolate(frame, [2840, 3040], [0, -470], { ...C, easing: ease });
  const globalFade = interpolate(frame, [3280, 3380], [1, 0], { ...C });

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

            <HArrow x1={UP.x + 55} x2={ING.x - NW / 2} y={UP.y} fromFrame={420} />
            <HArrow x1={ING.x + NW / 2} x2={MON.x - NW / 2} y={ING.y} fromFrame={700} />
            <HArrow x1={MON.x + NW / 2} x2={CLM.x - NW / 2} y={MON.y} fromFrame={920} />
            <HArrow x1={CLM.x + NW / 2} x2={SENT.x - 60} y={CLM.y} fromFrame={940} />
            <ScheduleArrow fromFrame={710} />

            <ArrowLabel
              x1={UP.x + 55}
              x2={ING.x - NW / 2}
              y={UP.y}
              label="receipt.uploaded"
              fromFrame={426}
            />
            <ArrowLabel
              x1={ING.x + NW / 2}
              x2={MON.x - NW / 2}
              y={ING.y}
              label="purchase.ingested"
              fromFrame={706}
            />
            <ArrowLabel
              x1={MON.x + NW / 2}
              x2={CLM.x - NW / 2}
              y={MON.y}
              label="price.dropped"
              fromFrame={926}
            />
            <ArrowLabel
              x1={CLM.x + NW / 2}
              x2={SENT.x - 60}
              y={CLM.y}
              label="claim.sent"
              fromFrame={946}
            />

            <Node
              x={UP.x}
              y={UP.y}
              w={110}
              h={110}
              fromFrame={240}
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
              fromFrame={430}
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
              fromFrame={710}
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
              fromFrame={930}
              title="claim-agent"
              sub="draft claim"
              gemini
              badges={["mongo", "phoenix"]}
            />
            <SentCard x={SENT.x} y={SENT.y} fromFrame={948} />
            <Node
              x={ASST.x}
              y={ASST.y}
              w={250}
              h={150}
              fromFrame={1585}
              title="assistant-agent"
              sub="answers your questions — not in the claim workflow"
              gemini
              badges={["mongo", "phoenix", "elastic"]}
            />

            {FIELDS.map((f, j) => (
              <FieldChip key={f} x={ING.x} y={478 + j * 40} label={f} fromFrame={450 + j * 8} />
            ))}
            <GeminiOcrLabel x={ING.x} y={478 + 4 * 40 + 6} fromFrame={490} />

            <Pill x={SCHED.x} y={SCHED.y} label="every 15 min" fromFrame={725} />

            <DraftSnippet x={CLM.x} y={CLM.y + 78} fromFrame={955} />

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

        {/* ═════ OVERLAY KEYNOTE CALLOUTS (screen-fixed, agent build) ═════ */}
        <Callout text="Gemini reads the receipt." fromFrame={480} toFrame={740} />
        <Callout text="Gemini watches the price." fromFrame={770} toFrame={960} />
        <Callout text="Gemini drafts the email." fromFrame={990} toFrame={1200} />
        <Callout text="Gemini redrafts on request." fromFrame={1600} toFrame={1820} />

        {/* ═════ MCP INTRO CARDS (lower half; rise into upper half in Phase E) ═════ */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${cardRiseY.toFixed(1)}px)`,
          }}
        >
          <McpCard
            x={180}
            top={620}
            w={480}
            fromFrame={D1}
            logoFile="mongodb.svg"
            name="MongoDB"
            purpose="The Assistant reads your live purchases and claims — straight from the database."
          />
          <McpCard
            x={1260}
            top={620}
            w={480}
            fromFrame={D2}
            logoFile="elasticsearch.svg"
            name="Elasticsearch"
            purpose="The Assistant searches every store's price-protection policy in seconds."
          />
          <McpCard
            x={720}
            top={620}
            w={480}
            fromFrame={D3}
            logoFile="phoenix.png"
            name="Arize Phoenix"
            purpose="Agents self-evaluate by reading their own reasoning traces."
          />
        </div>

        {/* ═════ TECHSTACK (Phase E — reveals in the vacated lower half) ═════ */}
        <BuiltOnTitle fromFrame={2980} top={560} />
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: 650,
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            rowGap: 28,
            columnGap: 14,
          }}
        >
          {TECH.map((t, i) => (
            <TechItem key={t.name} logo={t.logo} name={t.name} fromFrame={3020 + i * 6} />
          ))}
        </div>
      </AbsoluteFill>

      <BeatSubtitle
        text="We start with a receipt — upload it once."
        fromFrame={280}
        durationFrames={190}
      />
      <BeatSubtitle
        text="Gemini extracts the merchant, item, date, and price."
        fromFrame={490}
        durationFrames={230}
      />
      <BeatSubtitle
        text="Every 15 minutes, it checks the current price."
        fromFrame={740}
        durationFrames={200}
      />
      <BeatSubtitle
        text="When the price drops, claim-agent drafts and sends your email."
        fromFrame={960}
        durationFrames={230}
      />
      <BeatSubtitle
        text="And the assistant is always there when you need it."
        fromFrame={1590}
        durationFrames={200}
      />
    </HookAtmosphere>
  );
};
