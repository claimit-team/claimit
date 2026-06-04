// Beat 05 — ARCHITECTURE (single narrative beat) · 0:20–0:58 · 2280f / 38s.
// Merges old b05-b09 + b09b into ONE progressive build. Subtitle-only.
// Reveal primitive: useReveal (spring damping 14, mass 0.5, 18f) — image+text
// land together. Camera = transform on the arch wrapper (easeInOut, ~42f).
// ClaimIt brand blue = colors.brand.primary (#27466E, == peer COLOR.NAVY).
//
// ───────────────────────── STORYBOARD (frames @60fps) ─────────────────────────
//  0  INTRO TITLE ............... 0-240    "How it works?" in brand blue:
//        fade in big+centered (f0-60) → hold (60-150) → shrink ~40% + rise to
//        top-center (150-210) → settles as a fixed section header (210+).
//        No subtitle — the title IS the visual.
//  A  UPLOAD .................... 240-440  Upload chip springs in (f240).
//        sub "We start with a receipt — upload it once."         f280-470
//  B  INGEST + OCR + GEMINI ..... 420-720  arrow(+label "receipt.uploaded")→
//        ingest(+Gemini)→ field chips (8f stagger) + "Gemini read it (OCR)".
//        sub "Gemini extracts the merchant, item, date, and price."  f490-720
//  C  MONITOR + 15min .......... 700-940   arrow(+"purchase.ingested")→monitor
//        (+Gemini)→ "every 15 min" pill above with down-arrow INTO monitor.
//        sub "Every 15 minutes, it checks the current price."   f740-940
//  D  CLAIM + DRAFT + SENT ...... 920-1180 arrow(+"price.dropped")→claim(+Gemini);
//        arrow(+"claim.sent")→ Sent card (to Costco); typewriter draft snippet.
//        sub "When the price drops, claim-agent drafts and sends your email." f960-1190
//  E  MONGO + PHOENIX (no cam) .. 1180-1480 dashed lines→MongoDB Atlas (in place);
//        single Mongo→Phoenix trace connector + Phoenix tracing band. NO camera move.
//        sub "Every state and tool call is stored — and fully traced."  f1210-1480
//  F  SHRINK + LEFT (parallel) .. 1480-1790 ONE motion: scale 0.74 + tx -90
//        (f1490-1532); then center-out divider + assistant-agent sidecar.
//        sub "And the assistant is always there when you need it."  f1590-1790
//  G  SHIFT UP + TECHSTACK ...... 1790-2160 camera up 150 + drift back to center
//        (f1790-1832, no further shrink) frees bottom ~40% & aligns the techstack
//        under the diagram. Blue title "Built on Google Cloud + Gemini."
//        reveals FIRST (f1845), THEN logos one-by-one below it (f1905+, 6f stagger).
//        No bottom subtitle — the blue title carries it.
//  H  Soft outro ............... 2160-2280 whole composition → 85% opacity.
// ──────────────────────────────────────────────────────────────────────────────
import { Send, UploadCloud } from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { easings } from "../../polish/easings";
import { useReveal } from "../../polish/RevealCard";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";

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
const PHX_Y = 838;
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
const BRAND_BLUE = colors.brand.primary; // #27466E — same blue as the ClaimIt logo (b04)

// ── Intro section title: "How it works?" — big+centered, then shrinks to a
//    fixed top-center section header. NOT camera-transformed.
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
}> = ({ x, y, w, h, fromFrame, title, sub, topIcon, gemini }) => {
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
        <Img src={GEM} style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, opacity: 0.78 }} />
      )}
      {topIcon}
      <span style={{ fontSize: topIcon ? 12 : 16, fontWeight: topIcon ? 600 : 700, color: topIcon ? colors.text.muted : colors.text.dark, lineHeight: 1.25 }}>
        {title}
      </span>
      {sub ? <span style={{ fontSize: 12, color: colors.text.muted, lineHeight: 1.3 }}>{sub}</span> : null}
    </div>
  );
};

const HArrow: React.FC<{ x1: number; x2: number; y: number; fromFrame: number }> = ({ x1, x2, y, fromFrame }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [fromFrame, fromFrame + 14], [0, 1], { ...C, easing: easings.easeOut });
  return (
    <div style={{ position: "absolute", left: x1, top: y - 1, width: (x2 - x1) * p, height: 2, backgroundColor: colors.text.muted, opacity: 0.55 * Math.min(1, p * 3) }}>
      {p > 0.92 && (
        <div style={{ position: "absolute", right: -1, top: -3, width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: `6px solid ${colors.text.muted}` }} />
      )}
    </div>
  );
};

// ── Small event label sitting just above an arrow's line center. Same style
//    across all 4 agent-to-agent arrows. Reveals with its arrow.
const ArrowLabel: React.FC<{ x1: number; x2: number; y: number; label: string; fromFrame: number }> = ({ x1, x2, y, label, fromFrame }) => {
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

const Pill: React.FC<{ x: number; y: number; label: string; fromFrame: number; withIcon?: boolean }> = ({ x, y, label, fromFrame, withIcon }) => {
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
      {withIcon && <Img src={staticFile("brandlogos/googlepubsub.svg")} style={{ width: 13, height: 13 }} />}
      {label}
    </div>
  );
};

const FieldChip: React.FC<{ x: number; y: number; label: string; fromFrame: number }> = ({ x, y, label, fromFrame }) => {
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

// ── "Sent" destination at the end of the claim arrow (email to the retailer).
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
      <Send size={26} color={BRAND_BLUE} strokeWidth={2} aria-hidden />
      <span style={{ fontSize: 14, fontWeight: 700, color: colors.text.dark }}>Sent</span>
      <span style={{ fontSize: 11, color: colors.text.muted }}>to Costco</span>
    </div>
  );
};

const TechItem: React.FC<{ logo: string; name: string; fromFrame: number }> = ({ logo, name, fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div style={{ width: 185, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: r.opacity, transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})` }}>
      <Img src={staticFile(`brandlogos/${logo}`)} style={{ height: 38, maxWidth: 92, objectFit: "contain" }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark, fontFamily: FONT_STACK_TEXT, textAlign: "center" }}>{name}</span>
    </div>
  );
};

// ── Blue sub-section header above the techstack logos (Stage G hierarchy).
const BuiltOnTitle: React.FC<{ fromFrame: number }> = ({ fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 645,
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
  { logo: "mongodb.svg", name: "MongoDB Atlas" },
  { logo: "elasticsearch.svg", name: "Elasticsearch" },
  { logo: "phoenix.png", name: "Arize Phoenix" },
  { logo: "gmail.svg", name: "Gmail" },
];

const ScheduleArrow: React.FC<{ fromFrame: number }> = ({ fromFrame }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [fromFrame, fromFrame + 14], [0, 1], { ...C, easing: easings.easeOut });
  const y1 = SCHED.y + 16;
  const y2 = MON.y - NH / 2 - 4;
  return (
    <div style={{ position: "absolute", left: SCHED.x - 1, top: y1, width: 2, height: (y2 - y1) * p, backgroundColor: colors.text.muted, opacity: 0.55 * Math.min(1, p * 3) }}>
      {p > 0.92 && (
        <div style={{ position: "absolute", bottom: -1, left: -3, width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `6px solid ${colors.text.muted}` }} />
      )}
    </div>
  );
};

const GeminiOcrLabel: React.FC<{ x: number; y: number; fromFrame: number }> = ({ x, y, fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, 0) translateY(${r.translateY.toFixed(1)}px)`, opacity: r.opacity, display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_STACK_TEXT, fontSize: 12, color: colors.text.muted, whiteSpace: "nowrap" }}>
      <Img src={GEM} style={{ width: 13, height: 13, opacity: 0.8 }} />
      Gemini read it (OCR)
    </div>
  );
};

const DRAFT = "Hello Costco, I purchased this item…";
const DraftSnippet: React.FC<{ x: number; y: number; fromFrame: number }> = ({ x, y, fromFrame }) => {
  const frame = useCurrentFrame();
  const r = useReveal(fromFrame);
  const typeStart = fromFrame + 4;
  const typeEnd = typeStart + Math.ceil(DRAFT.length / 1.5); // ~1.5 chars/frame
  const chars = Math.max(0, Math.floor(interpolate(frame, [typeStart, typeEnd], [0, DRAFT.length], C)));
  const typing = frame >= typeStart && frame < typeEnd + 22;
  const cursorOn = Math.floor(frame / 12) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: x - 115, top: y, width: 230, opacity: r.opacity, transform: `translateY(${r.translateY.toFixed(1)}px)`, fontFamily: FONT_STACK_TEXT, fontSize: 11, lineHeight: 1.45, color: colors.text.muted, backgroundColor: colors.bg.surface, border: BORDER, borderRadius: 10, padding: 10, boxShadow: "0 4px 12px rgba(15,20,25,0.06)", minHeight: 36 }}>
      {DRAFT.slice(0, chars)}
      {typing && <span style={{ opacity: cursorOn ? 0.9 : 0, color: BRAND_BLUE }}>▌</span>}
    </div>
  );
};

const PhoenixBand: React.FC<{ y: number; fromFrame: number }> = ({ y, fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, opacity: r.opacity, transform: `translateY(${r.translateY.toFixed(1)}px)`, fontFamily: FONT_STACK_TEXT }}>
      <Img src={staticFile("brandlogos/phoenix.png")} style={{ width: 26, height: 26, objectFit: "contain" }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: colors.text.dark }}>Phoenix tracing</span>
      <span style={{ fontSize: 12, color: colors.text.muted }}>— every decision, tool call &amp; Gemini draft</span>
    </div>
  );
};

export const Beat05: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = easings.easeInOut;

  // Camera. E: identity (no move). F: parallel shrink + shift-left (ONE motion).
  // G: shift up only (no further shrink) to free the bottom for the techstack.
  const camScale = interpolate(frame, [1490, 1532], [1, 0.74], { ...C, easing: ease });
  // F: shift left (reveal the assistant on the right). G: drift back toward
  // center as it rises, so the techstack lands aligned under the diagram.
  const camTx =
    interpolate(frame, [1490, 1532], [0, -90], { ...C, easing: ease }) +
    interpolate(frame, [1790, 1832], [0, 70], { ...C, easing: ease });
  const camTy = interpolate(frame, [1790, 1832], [0, -150], { ...C, easing: ease });
  const globalFade = interpolate(frame, [2160, 2280], [1, 0.85], { ...C });

  const mongoLineOp = interpolate(frame, [1195, 1240], [0, 0.3], { ...C });
  const phxLineOp = interpolate(frame, [1240, 1280], [0, 0.4], { ...C });
  const dividerP = interpolate(frame, [1545, 1575], [0, 1], { ...C, easing: easings.easeOut });

  return (
    <HookAtmosphere>
      <AbsoluteFill style={{ opacity: globalFade }}>
        {/* Section header — "How it works?" persists top-center (NOT transformed). */}
        <IntroTitle />

        {/* ═════ ARCH GROUP (camera-transformed) ═════ */}
        <AbsoluteFill style={{ transform: `translate(${camTx.toFixed(1)}px, ${camTy.toFixed(1)}px) scale(${camScale.toFixed(4)})`, transformOrigin: "830px 460px" }}>
          <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            {[ING, MON, CLM].map((a) => (
              <line key={`m-${a.x}`} x1={a.x} y1={a.y + NH / 2} x2={MONGO.x} y2={MONGO.y - 42} stroke={colors.brand.primary} strokeWidth={1.5} strokeDasharray="5 5" opacity={mongoLineOp} />
            ))}
            {/* subtle MongoDB → Phoenix trace connector */}
            <line x1={MONGO.x} y1={MONGO.y + 42} x2={MONGO.x} y2={PHX_Y - 2} stroke={colors.semantic.warning} strokeWidth={1.5} strokeDasharray="3 5" opacity={phxLineOp} />
            <line x1={DIV_X} y1={455 - 305 * dividerP} x2={DIV_X} y2={455 + 305 * dividerP} stroke={colors.text.muted} strokeWidth={1} strokeDasharray="2 6" opacity={0.4 * Math.min(1, dividerP * 3)} />
          </svg>

          <HArrow x1={UP.x + 55} x2={ING.x - NW / 2} y={UP.y} fromFrame={420} />
          <HArrow x1={ING.x + NW / 2} x2={MON.x - NW / 2} y={ING.y} fromFrame={700} />
          <HArrow x1={MON.x + NW / 2} x2={CLM.x - NW / 2} y={MON.y} fromFrame={920} />
          <HArrow x1={CLM.x + NW / 2} x2={SENT.x - 60} y={CLM.y} fromFrame={940} />
          <ScheduleArrow fromFrame={710} />

          <ArrowLabel x1={UP.x + 55} x2={ING.x - NW / 2} y={UP.y} label="receipt.uploaded" fromFrame={426} />
          <ArrowLabel x1={ING.x + NW / 2} x2={MON.x - NW / 2} y={ING.y} label="purchase.ingested" fromFrame={706} />
          <ArrowLabel x1={MON.x + NW / 2} x2={CLM.x - NW / 2} y={MON.y} label="price.dropped" fromFrame={926} />
          <ArrowLabel x1={CLM.x + NW / 2} x2={SENT.x - 60} y={CLM.y} label="claim.sent" fromFrame={946} />

          <Node x={UP.x} y={UP.y} w={110} h={110} fromFrame={240} title="Upload" topIcon={<UploadCloud size={30} color={colors.brand.primary} strokeWidth={2} aria-hidden />} />
          <Node x={ING.x} y={ING.y} w={NW} h={NH} fromFrame={430} title="ingest-agent" sub="extract" gemini />
          <Node x={MON.x} y={MON.y} w={NW} h={NH} fromFrame={710} title="monitor-agent" sub="watch price" gemini />
          <Node x={CLM.x} y={CLM.y} w={NW} h={NH} fromFrame={930} title="claim-agent" sub="draft claim" gemini />
          <SentCard x={SENT.x} y={SENT.y} fromFrame={948} />
          <Node x={ASST.x} y={ASST.y} w={250} h={150} fromFrame={1585} title="assistant-agent" sub="answers your questions — not in the claim workflow" gemini />

          {FIELDS.map((f, j) => (
            <FieldChip key={f} x={ING.x} y={478 + j * 40} label={f} fromFrame={450 + j * 8} />
          ))}
          <GeminiOcrLabel x={ING.x} y={478 + 4 * 40 + 6} fromFrame={490} />

          <Pill x={SCHED.x} y={SCHED.y} label="every 15 min" fromFrame={725} />

          <DraftSnippet x={CLM.x} y={CLM.y + 78} fromFrame={955} />

          <Node x={MONGO.x} y={MONGO.y} w={300} h={84} fromFrame={1190} title="MongoDB Atlas" sub="purchases · claims · policies" />
          <PhoenixBand y={PHX_Y} fromFrame={1215} />
        </AbsoluteFill>

        {/* ═════ TECHSTACK (Stage G — fixed; fills freed bottom; title → logos) ═════ */}
        <BuiltOnTitle fromFrame={1845} />
        <div style={{ position: "absolute", left: 60, right: 60, top: 728, display: "flex", justifyContent: "center", flexWrap: "wrap", rowGap: 28, columnGap: 14 }}>
          {TECH.map((t, i) => (
            <TechItem key={t.name} logo={t.logo} name={t.name} fromFrame={1905 + i * 6} />
          ))}
        </div>
      </AbsoluteFill>

      <BeatSubtitle text="We start with a receipt — upload it once." fromFrame={280} durationFrames={190} />
      <BeatSubtitle text="Gemini extracts the merchant, item, date, and price." fromFrame={490} durationFrames={230} />
      <BeatSubtitle text="Every 15 minutes, it checks the current price." fromFrame={740} durationFrames={200} />
      <BeatSubtitle text="When the price drops, claim-agent drafts and sends your email." fromFrame={960} durationFrames={230} />
      <BeatSubtitle text="Every state and tool call is stored — and fully traced." fromFrame={1210} durationFrames={270} />
      <BeatSubtitle text="And the assistant is always there when you need it." fromFrame={1590} durationFrames={200} />
    </HookAtmosphere>
  );
};
