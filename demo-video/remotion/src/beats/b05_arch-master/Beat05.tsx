// Beat 05 — ARCHITECTURE (single narrative beat) · 0:20–0:53 · 1980f / 33s.
// Merges old b05-b09 + b09b into ONE progressive build with camera moves +
// techstack outro. Subtitle-only (CC-written narration; vo_b05-b09 unused).
// Reveal primitive: useReveal (spring damping 14, mass 0.5, 18f) — image+text
// land together. Camera = transform on the arch wrapper (easeInOut, 30f).
//
// ───────────────────────── STORYBOARD (frames @60fps) ─────────────────────────
//  A  UPLOAD entry .............. 0-180    Upload chip springs in.
//        sub "Upload a receipt — once."                       f30-180
//  B  INGEST + OCR + GEMINI ...... 180-480  arrow→ingest card(+Gemini mark)→
//        field chips (Merchant/Item/Date/Price, 8f stagger) + "Gemini read it (OCR)".
//        sub "Gemini extracts the merchant, item, date, and price."  f230-470
//  C  MONITOR + 15min ........... 480-720  arrow→monitor(+Gemini)→ "every 15 min"
//        pill above with a down-arrow INTO monitor.
//        sub "Every 15 minutes, it checks the current price."  f520-710
//  D  CLAIM + draft ............. 720-960  arrow→claim(+Gemini)→ claim.drafted pill
//        + truncated draft snippet.
//        sub "When the price drops, claim-agent drafts your email."  f760-950
//  E  SHIFT UP + MONGO/PHOENIX ... 960-1320 camera up 110px (f960-990); dashed
//        lines down to MongoDB Atlas + Phoenix tracing band.
//        sub "Every state and tool call is stored and fully traced."  f1020-1310
//  F  SHIFT LEFT + ASSISTANT ..... 1320-1580 camera left 260px (f1320-1350);
//        center-out divider + assistant-agent sidecar.
//        sub "And the assistant is always there when you need it."  f1370-1570
//  G  SHRINK + TECHSTACK ......... 1580-1860 camera scale 0.65 + up 80 (f1580-1610);
//        fast logo row in freed bottom (5f stagger), incl. Arize Phoenix.
//        sub "All running on tech you can trust."  f1640-1830
//  H  Soft outro ................ 1860-1980 whole composition → 80% opacity.
// ──────────────────────────────────────────────────────────────────────────────
import { UploadCloud } from "lucide-react";
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
const SCHED = { x: 925, y: 205 };
const MONGO = { x: 925, y: 650 };
const ASST = { x: 1700, y: 380 };
const DIV_X = 1520;
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

const TechItem: React.FC<{ logo: string; name: string; fromFrame: number }> = ({ logo, name, fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div style={{ width: 185, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: r.opacity, transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})` }}>
      <Img src={staticFile(`brandlogos/${logo}`)} style={{ height: 38, maxWidth: 92, objectFit: "contain" }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark, fontFamily: FONT_STACK_TEXT, textAlign: "center" }}>{name}</span>
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
  const y1 = SCHED.y + 18;
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

const DraftSnippet: React.FC<{ x: number; y: number; fromFrame: number }> = ({ x, y, fromFrame }) => {
  const frame = useCurrentFrame();
  const r = useReveal(fromFrame);
  const chars = Math.max(0, Math.floor(interpolate(frame, [fromFrame + 6, fromFrame + 46], [0, 24], C)));
  return (
    <div style={{ position: "absolute", left: x - 100, top: y, width: 220, opacity: r.opacity, transform: `translateY(${r.translateY.toFixed(1)}px)`, fontFamily: FONT_STACK_TEXT, fontSize: 11, color: colors.text.muted, backgroundColor: colors.bg.surface, border: BORDER, borderRadius: 10, padding: 10, boxShadow: "0 4px 12px rgba(15,20,25,0.06)", minHeight: 18 }}>
      {"Hello Costco, I purchased…".slice(0, chars)}
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

  const camTy =
    interpolate(frame, [960, 990], [0, -110], { ...C, easing: ease }) +
    interpolate(frame, [1580, 1610], [0, -80], { ...C, easing: ease });
  const camTx = interpolate(frame, [1320, 1350], [0, -260], { ...C, easing: ease });
  const camScale = interpolate(frame, [1580, 1610], [1, 0.65], { ...C, easing: ease });
  const globalFade = interpolate(frame, [1860, 1980], [1, 0.8], { ...C });

  const mongoLineOp = interpolate(frame, [1000, 1035], [0, 0.3], { ...C });
  const phxLineOp = interpolate(frame, [1025, 1060], [0, 0.4], { ...C });
  const dividerP = interpolate(frame, [1352, 1374], [0, 1], { ...C, easing: easings.easeOut });

  return (
    <HookAtmosphere>
      <AbsoluteFill style={{ opacity: globalFade }}>
        {/* ═════ ARCH GROUP (camera-transformed) ═════ */}
        <AbsoluteFill style={{ transform: `translate(${camTx.toFixed(1)}px, ${camTy.toFixed(1)}px) scale(${camScale.toFixed(4)})`, transformOrigin: "830px 380px" }}>
          <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            {[ING, MON, CLM].map((a) => (
              <line key={`m-${a.x}`} x1={a.x} y1={a.y + NH / 2} x2={MONGO.x} y2={MONGO.y - 42} stroke={colors.brand.primary} strokeWidth={1.5} strokeDasharray="5 5" opacity={mongoLineOp} />
            ))}
            {/* subtle MongoDB → Phoenix trace connector (storyboard E: "connection from MongoDB down to Phoenix") */}
            <line x1={MONGO.x} y1={MONGO.y + 42} x2={MONGO.x} y2={PHX_Y - 2} stroke={colors.semantic.warning} strokeWidth={1.5} strokeDasharray="3 5" opacity={phxLineOp} />
            <line x1={DIV_X} y1={455 - 305 * dividerP} x2={DIV_X} y2={455 + 305 * dividerP} stroke={colors.text.muted} strokeWidth={1} strokeDasharray="2 6" opacity={0.4 * Math.min(1, dividerP * 3)} />
          </svg>

          <HArrow x1={UP.x + 55} x2={ING.x - NW / 2} y={UP.y} fromFrame={185} />
          <HArrow x1={ING.x + NW / 2} x2={MON.x - NW / 2} y={ING.y} fromFrame={485} />
          <HArrow x1={MON.x + NW / 2} x2={CLM.x - NW / 2} y={MON.y} fromFrame={725} />
          <HArrow x1={CLM.x + NW / 2} x2={1500} y={CLM.y} fromFrame={748} />
          <ScheduleArrow fromFrame={500} />

          <Node x={UP.x} y={UP.y} w={110} h={110} fromFrame={6} title="Upload" topIcon={<UploadCloud size={30} color={colors.brand.primary} strokeWidth={2} aria-hidden />} />
          <Node x={ING.x} y={ING.y} w={NW} h={NH} fromFrame={195} title="ingest-agent" sub="extract" gemini />
          <Node x={MON.x} y={MON.y} w={NW} h={NH} fromFrame={500} title="monitor-agent" sub="watch price" gemini />
          <Node x={CLM.x} y={CLM.y} w={NW} h={NH} fromFrame={740} title="claim-agent" sub="draft claim" gemini />
          <Node x={ASST.x} y={ASST.y} w={250} h={150} fromFrame={1370} title="assistant-agent" sub="answers your questions — not in the claim workflow" gemini />

          {FIELDS.map((f, j) => (
            <FieldChip key={f} x={ING.x} y={478 + j * 40} label={f} fromFrame={215 + j * 8} />
          ))}
          <GeminiOcrLabel x={ING.x} y={478 + 4 * 40 + 6} fromFrame={255} />

          <Pill x={SCHED.x} y={SCHED.y} label="every 15 min" fromFrame={515} />

          <Pill x={1430} y={CLM.y - 36} label="claim.drafted" fromFrame={760} withIcon />
          <DraftSnippet x={CLM.x} y={CLM.y + 78} fromFrame={770} />

          <Node x={MONGO.x} y={MONGO.y} w={300} h={84} fromFrame={1000} title="MongoDB Atlas" sub="purchases · claims · policies" />
          <PhoenixBand y={PHX_Y} fromFrame={1025} />
        </AbsoluteFill>

        {/* ═════ TECHSTACK (Stage G — fixed; fills freed bottom) ═════ */}
        <div style={{ position: "absolute", left: 60, right: 60, top: 660, display: "flex", justifyContent: "center", flexWrap: "wrap", rowGap: 28, columnGap: 14 }}>
          {TECH.map((t, i) => (
            <TechItem key={t.name} logo={t.logo} name={t.name} fromFrame={1615 + i * 5} />
          ))}
        </div>
      </AbsoluteFill>

      <BeatSubtitle text="Upload a receipt — once." fromFrame={30} durationFrames={150} />
      <BeatSubtitle text="Gemini extracts the merchant, item, date, and price." fromFrame={230} durationFrames={240} />
      <BeatSubtitle text="Every 15 minutes, it checks the current price." fromFrame={520} durationFrames={190} />
      <BeatSubtitle text="When the price drops, claim-agent drafts your email." fromFrame={760} durationFrames={190} />
      <BeatSubtitle text="Every state and tool call is stored and fully traced." fromFrame={1020} durationFrames={290} />
      <BeatSubtitle text="And the assistant is always there when you need it." fromFrame={1370} durationFrames={200} />
      <BeatSubtitle text="All running on tech you can trust." fromFrame={1640} durationFrames={190} />
    </HookAtmosphere>
  );
};
