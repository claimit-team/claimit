// Beat 05 — ARCHITECTURE (Apple rolling-pan summary) · 2280f / 38s.
// Plays AFTER the demo (HOOK → DEMO → ARCH → PAYOFF), so the tone is
// "here's what just powered that" — a confident summary, not a tutorial.
//
// Camera = a single transform on the arch wrapper. transformOrigin is the
// viewport center (960,540), so to center any canvas point P at scale s:
//   camTx = s * (960 - P.x)        camTy keyframed to anchor P.y on screen.
// Multi-stop interpolate eases EACH segment (Remotion behaviour), giving the
// slow-start / slow-end keynote dollies. Reveal primitive: useReveal (shared).
//
// ───────────────────────── STORYBOARD (frames @60fps) ─────────────────────
//  A  OPEN ............ 0-180     scale 1.5, framed on the left (Upload+Ingest).
//        "Powered by four agents." fades in top-center, then yields to Ingest.
//  B  ROLLING PAN ..... 180-1380  scale 1.5, translateX walks RIGHT, one agent
//        at a time (~300f each). As the pan reaches an agent its card lands and
//        a large light keynote CALLOUT appears top-center, holds ~3s, then the
//        pan resumes. Each agent carries a badge stack (the Gemini-corner badge
//        signature, extended): Gemini · MongoDB MCP · Phoenix (+ Elasticsearch
//        on Assistant).
//          Ingest   180-470   "Gemini reads the receipt."
//          Monitor  490-770   "Gemini watches the price."
//          Claim    790-1080  "Gemini drafts the email."
//          Assistant 1090-1370 "Gemini redrafts on request."
//  C  REVEAL ......... 1380-1800 scale back to 1.0, recenter the whole canvas.
//        Connection lines draw ON, staggered: MongoDB MCP → all 4 (solid blue,
//        data), Phoenix → all 4 (dashed lavender, observability), Elasticsearch
//        → Assistant only (amber, policy search). Hold on the full form.
//  D  BUILT-ON ........ 1800-2280 architecture lifts up; "Built on Google Cloud
//        + Gemini." then the techstack logos reveal one-by-one (MongoDB MCP).
// ────────────────────────────────────────────────────────────────────────────
import { LineChart, Mail, ScanLine, Sparkles, UploadCloud } from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { useReveal } from "../../polish/RevealCard";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const BRAND_BLUE = colors.brand.primary; // #27466E — ClaimIt navy
const AMBER = colors.semantic.warning; // #F59E0B — Elasticsearch accent
const LAVENDER = "#8B83B0"; // muted "observability, not data" line color
const BORDER = "1px solid rgba(15,20,25,0.10)";

// ── Layout (canvas coords inside a 1920×1080 stage) ─────────────────────────
const AGENT_Y = 440;
const CARD_W = 220;
const CARD_H = 150;
const UPLOAD = { x: 200, y: AGENT_Y };
const ING = 540;
const MON = 880;
const CLM = 1220;
const ASST = 1560;
const MONGO = { x: 880, y: 792 };
const PHX = { x: 1300, y: 838 };
const ES = { x: 1790, y: 618 };
const FULL_CX = 995; // horizontal center of the whole diagram (Phase C/D)

// ── Brand chips for the badge stacks (the visual signature) ─────────────────
const BADGE_SRC: Record<string, string> = {
  gemini: "brandlogos/googlegemini.svg",
  mongo: "brandlogos/mongodb.svg",
  phoenix: "brandlogos/phoenix.png",
  elastic: "brandlogos/elasticsearch.svg",
};

type AgentDef = {
  key: string;
  x: number;
  title: string;
  role: string;
  icon: React.ReactNode;
  reveal: number;
  focus: [number, number];
  badges: string[];
};

const ICON = { size: 26, color: BRAND_BLUE, strokeWidth: 1.75 } as const;
const AGENTS: AgentDef[] = [
  {
    key: "ingest",
    x: ING,
    title: "Ingest",
    role: "reads the receipt",
    icon: <ScanLine {...ICON} aria-hidden="true" />,
    reveal: 30,
    focus: [180, 470],
    badges: ["gemini", "mongo", "phoenix"],
  },
  {
    key: "monitor",
    x: MON,
    title: "Monitor",
    role: "watches the price",
    icon: <LineChart {...ICON} aria-hidden="true" />,
    reveal: 470,
    focus: [490, 770],
    badges: ["gemini", "mongo", "phoenix"],
  },
  {
    key: "claim",
    x: CLM,
    title: "Claim",
    role: "drafts the email",
    icon: <Mail {...ICON} aria-hidden="true" />,
    reveal: 770,
    focus: [790, 1080],
    badges: ["gemini", "mongo", "phoenix"],
  },
  {
    key: "assistant",
    x: ASST,
    title: "Assistant",
    role: "redrafts on request",
    icon: <Sparkles {...ICON} aria-hidden="true" />,
    reveal: 1070,
    focus: [1090, 1370],
    badges: ["gemini", "mongo", "phoenix", "elastic"],
  },
];

// ── Small brand chip — the Gemini-corner badge style, generalized. ──────────
const BadgeChip: React.FC<{ kind: string }> = ({ kind }) => (
  <div
    style={{
      width: 28,
      height: 28,
      borderRadius: 8,
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
      style={{ width: 17, height: 17, objectFit: "contain" }}
    />
  </div>
);

// ── Agent card. Reveals with useReveal; a soft outer glow + tiny lift while it
//    is the focused agent (focus window). Badge stack along the bottom edge.
const AgentCard: React.FC<{ def: AgentDef }> = ({ def }) => {
  const frame = useCurrentFrame();
  const r = useReveal(def.reveal);
  const focusAmt = interpolate(
    frame,
    [def.focus[0] - 34, def.focus[0], def.focus[1], def.focus[1] + 34],
    [0, 1, 1, 0],
    C,
  );
  const lift = -6 * focusAmt;
  const glow = 0.06 + 0.16 * focusAmt;
  return (
    <div
      style={{
        position: "absolute",
        left: def.x - CARD_W / 2,
        top: AGENT_Y - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
        padding: "18px 16px 14px",
        boxSizing: "border-box",
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 20,
        boxShadow: `0 10px 30px rgba(15,20,25,${glow.toFixed(3)}), 0 2px 6px rgba(15,20,25,0.05)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        textAlign: "center",
        fontFamily: FONT_STACK_TEXT,
        opacity: r.opacity,
        transform: `translateY(${(r.translateY + lift).toFixed(1)}px) scale(${(r.scale + 0.02 * focusAmt).toFixed(4)})`,
        transformOrigin: "center",
      }}
    >
      {def.icon}
      <span
        style={{ fontSize: 26, fontWeight: 600, color: colors.text.dark, letterSpacing: "-0.02em" }}
      >
        {def.title}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.muted, letterSpacing: "0" }}>
        {def.role}
      </span>
      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        {def.badges.map((b) => (
          <BadgeChip key={b} kind={b} />
        ))}
      </div>
    </div>
  );
};

// ── Upload origin chip (left edge). ─────────────────────────────────────────
const UploadChip: React.FC = () => {
  const r = useReveal(10);
  const w = 124;
  const h = 124;
  return (
    <div
      style={{
        position: "absolute",
        left: UPLOAD.x - w / 2,
        top: UPLOAD.y - h / 2,
        width: w,
        height: h,
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 20,
        boxShadow: "0 8px 22px rgba(15,20,25,0.07)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontFamily: FONT_STACK_TEXT,
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
      }}
    >
      <UploadCloud size={34} color={BRAND_BLUE} strokeWidth={1.75} aria-hidden="true" />
      <span style={{ fontSize: 16, fontWeight: 600, color: colors.text.dark }}>Upload</span>
    </div>
  );
};

// ── Thin pipeline connector between two consecutive nodes (draws on width). ──
const FlowConnector: React.FC<{ x1: number; x2: number; y: number; fromFrame: number }> = ({
  x1,
  x2,
  y,
  fromFrame,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [fromFrame, fromFrame + 16], [0, 1], {
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
        backgroundColor: colors.neutral[300],
        opacity: 0.9 * Math.min(1, p * 3),
      }}
    />
  );
};

// ── Service node (MongoDB MCP / Phoenix / Elasticsearch) revealed in Phase C. ─
const ServiceNode: React.FC<{
  x: number;
  y: number;
  logo: string;
  title: string;
  sub: string;
  fromFrame: number;
  accent: string;
}> = ({ x, y, logo, title, sub, fromFrame, accent }) => {
  const r = useReveal(fromFrame);
  const w = 250;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - 40,
        width: w,
        padding: "12px 18px",
        boxSizing: "border-box",
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 16,
        boxShadow: "0 8px 24px rgba(15,20,25,0.07)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: FONT_STACK_TEXT,
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
      }}
    >
      <Img src={staticFile(logo)} style={{ width: 30, height: 30, objectFit: "contain" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: colors.text.dark }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: accent }}>{sub}</span>
      </div>
    </div>
  );
};

// ── A single draw-on connection line (animates its end-point). Works for both
//    solid and dashed strokes (we animate geometry, not dashoffset).
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
  const p = interpolate(frame, [fromFrame, fromFrame + 40], [0, 1], {
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
      opacity={dashed ? 0.6 : 0.85}
    />
  );
};

// ── Top-center keynote caption (screen-fixed). One line at a time. ──────────
const Callout: React.FC<{ text: string; fromFrame: number; toFrame: number }> = ({
  text,
  fromFrame,
  toFrame,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [fromFrame, fromFrame + 18, toFrame - 18, toFrame],
    [0, 1, 1, 0],
    { ...C, easing: easings.easeInOut },
  );
  const y = interpolate(frame, [fromFrame, fromFrame + 22], [14, 0], {
    ...C,
    easing: easings.easeOut,
  });
  if (frame < fromFrame || frame > toFrame) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 196,
        textAlign: "center",
        opacity,
        transform: `translateY(${y.toFixed(1)}px)`,
        fontFamily: FONT_STACK_TEXT,
        fontSize: 56,
        fontWeight: 400,
        letterSpacing: "-0.015em",
        color: colors.text.dark,
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
};

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

const BuiltOnTitle: React.FC<{ fromFrame: number }> = ({ fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 648,
        textAlign: "center",
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px)`,
        fontFamily: FONT_STACK_TEXT,
        fontWeight: 600,
        fontSize: 38,
        letterSpacing: "-0.02em",
        color: BRAND_BLUE,
      }}
    >
      Built on Google Cloud + Gemini.
    </div>
  );
};

// ── Opening line (Phase A) — confident, screen-fixed, then yields. ──────────
const OpeningLine: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [10, 40, 150, 178], [0, 1, 1, 0], {
    ...C,
    easing: easings.easeInOut,
  });
  if (frame > 178) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 188,
        textAlign: "center",
        opacity,
        fontFamily: FONT_STACK_TEXT,
        fontSize: 64,
        fontWeight: 600,
        letterSpacing: "-0.025em",
        color: BRAND_BLUE,
      }}
    >
      Powered by four agents.
    </div>
  );
};

export const Beat05: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = easings.easeInOut;

  // ── Camera (transformOrigin = viewport center 960,540) ───────────────────
  const camScale = interpolate(frame, [0, 1380, 1560, 1800, 1860], [1.5, 1.5, 1.0, 1.0, 0.9], {
    ...C,
    easing: ease,
  });
  // focusX = the canvas x we want centered. Holds on each agent, eases between.
  const focusX = interpolate(
    frame,
    [0, 460, 500, 770, 810, 1080, 1120, 1370, 1560],
    [ING, ING, MON, MON, CLM, CLM, ASST, ASST, FULL_CX],
    { ...C, easing: ease },
  );
  const camTx = camScale * (960 - focusX);
  // Vertical anchor: agents sit low-center during A/B (room for top callout),
  // then recenter for the full reveal, then lift for the techstack.
  const camTy = interpolate(frame, [0, 1380, 1560, 1800, 1860], [200, 200, -82, -82, -232], {
    ...C,
    easing: ease,
  });
  const globalFade = interpolate(frame, [2210, 2280], [1, 0.9], { ...C });

  // Agent bottom anchor for wires.
  const agentBottom = AGENT_Y + CARD_H / 2 - 6;

  return (
    <HookAtmosphere>
      <AbsoluteFill style={{ opacity: globalFade }}>
        {/* Soft centered depth wash over the flat backdrop. */}
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(60% 50% at 50% 46%, rgba(39,70,110,0.06) 0%, rgba(39,70,110,0) 70%)",
          }}
        />

        {/* ═════ ARCH GROUP (camera-transformed) ═════ */}
        <AbsoluteFill
          style={{
            transform: `translate(${camTx.toFixed(1)}px, ${camTy.toFixed(1)}px) scale(${camScale.toFixed(4)})`,
            transformOrigin: "960px 540px",
          }}
        >
          {/* Connection network (Phase C) — drawn UNDER the cards. */}
          <svg
            aria-hidden="true"
            width={1920}
            height={1080}
            style={{ position: "absolute", inset: 0 }}
          >
            {/* MongoDB MCP → every agent (solid blue, the data layer). */}
            {[ING, MON, CLM, ASST].map((ax, i) => (
              <Wire
                key={`mongo-${ax}`}
                x1={MONGO.x}
                y1={MONGO.y - 40}
                x2={ax}
                y2={agentBottom}
                color={BRAND_BLUE}
                width={2.5}
                fromFrame={1400 + i * 10}
              />
            ))}
            {/* Phoenix → every agent (dashed lavender, observability). */}
            {[ING, MON, CLM, ASST].map((ax, i) => (
              <Wire
                key={`phx-${ax}`}
                x1={PHX.x}
                y1={PHX.y - 40}
                x2={ax}
                y2={agentBottom}
                color={LAVENDER}
                width={1.5}
                dashed
                fromFrame={1500 + i * 10}
              />
            ))}
            {/* Elasticsearch → Assistant only (amber, policy search). */}
            <Wire
              x1={ES.x}
              y1={ES.y - 24}
              x2={ASST}
              y2={agentBottom}
              color={AMBER}
              width={2}
              fromFrame={1590}
            />
          </svg>

          {/* Pipeline flow connectors between consecutive nodes. */}
          <FlowConnector x1={UPLOAD.x + 62} x2={ING - CARD_W / 2} y={AGENT_Y} fromFrame={40} />
          <FlowConnector x1={ING + CARD_W / 2} x2={MON - CARD_W / 2} y={AGENT_Y} fromFrame={472} />
          <FlowConnector x1={MON + CARD_W / 2} x2={CLM - CARD_W / 2} y={AGENT_Y} fromFrame={772} />
          <FlowConnector
            x1={CLM + CARD_W / 2}
            x2={ASST - CARD_W / 2}
            y={AGENT_Y}
            fromFrame={1072}
          />

          <UploadChip />
          {AGENTS.map((a) => (
            <AgentCard key={a.key} def={a} />
          ))}

          {/* Service nodes (revealed as the network draws in). */}
          <ServiceNode
            x={MONGO.x}
            y={MONGO.y}
            logo="brandlogos/mongodb.svg"
            title="MongoDB MCP"
            sub="shared memory · purchases · claims"
            fromFrame={1390}
            accent={BRAND_BLUE}
          />
          <ServiceNode
            x={PHX.x}
            y={PHX.y}
            logo="brandlogos/phoenix.png"
            title="Arize Phoenix"
            sub="traces every decision"
            fromFrame={1440}
            accent={LAVENDER}
          />
          <ServiceNode
            x={ES.x}
            y={ES.y}
            logo="brandlogos/elasticsearch.svg"
            title="Elasticsearch"
            sub="policy search"
            fromFrame={1490}
            accent={AMBER}
          />
        </AbsoluteFill>

        {/* ═════ SCREEN-FIXED CAPTIONS ═════ */}
        <OpeningLine />
        <Callout text="Gemini reads the receipt." fromFrame={196} toFrame={470} />
        <Callout text="Gemini watches the price." fromFrame={500} toFrame={770} />
        <Callout text="Gemini drafts the email." fromFrame={800} toFrame={1080} />
        <Callout text="Gemini redrafts on request." fromFrame={1100} toFrame={1370} />

        {/* ═════ TECHSTACK (Phase D — fixed; fills the freed bottom) ═════ */}
        <BuiltOnTitle fromFrame={1850} />
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: 730,
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            rowGap: 28,
            columnGap: 14,
          }}
        >
          {TECH.map((t, i) => (
            <TechItem key={t.name} logo={t.logo} name={t.name} fromFrame={1910 + i * 6} />
          ))}
        </div>
      </AbsoluteFill>

      {/* Burned-in narration (PROJECT LAW: subtitles always). Re-mapped to the
          new 4-phase arc + the reveal. */}
      <BeatSubtitle
        text="Gemini reads every receipt the moment you upload it."
        fromFrame={196}
        durationFrames={274}
      />
      <BeatSubtitle
        text="It watches the price for you — every fifteen minutes."
        fromFrame={500}
        durationFrames={270}
      />
      <BeatSubtitle
        text="When the price drops, it drafts your claim automatically."
        fromFrame={800}
        durationFrames={280}
      />
      <BeatSubtitle
        text="And the assistant redrafts it the instant you ask."
        fromFrame={1100}
        durationFrames={270}
      />
      <BeatSubtitle
        text="Four agents, one shared memory — all on MongoDB MCP."
        fromFrame={1420}
        durationFrames={360}
      />
    </HookAtmosphere>
  );
};
