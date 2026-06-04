// ArchFlow v2 — REAL ClaimIt architecture for the Architecture section (b5-9).
//
// Ground truth (from apps/* + packages/shared/pubsub + infra/terraform):
//   3 workflow agents L→R: ingest-agent → monitor-agent → claim-agent,
//   each a Gemini-2.5-flash ADK agent, joined by real Pub/Sub events.
//     ingest → monitor : "purchase.ingested"
//     monitor → claim  : "price.dropped"
//     claim → (user)   : "claim.drafted"
//   MongoDB Atlas = state store BELOW the pipeline (purchases/claims/policies),
//   read/written by every agent (dashed arrows).
//   Cloud Scheduler clock drives monitor-agent ("every 15 min").
//   Phoenix = trace layer beneath, capturing every Gemini call.
//   assistant-agent = SIDECAR on the right, NOT in the claim workflow
//     (answers user questions; only emits claim.redraft_requested).
//
// `litCount` (1-5) drives the stage-by-stage reveal for beats 5-9.
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import { easings } from "../polish/easings";
import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const ING = { x: 380, y: 360 };
const MON = { x: 770, y: 360 };
const CLM = { x: 1160, y: 360 };
const INPUT = { x: 150, y: 360 };
const SCHED = { x: 770, y: 168 };
const MONGO = { x: 770, y: 612 };
const ASST = { x: 1620, y: 360 };
const NW = 156;
const NH = 96;
const BORDER = "1px solid rgba(15,20,25,0.10)";
const SHADOW = "0 6px 18px rgba(15,20,25,0.08)";

const AGENTS = [
  { ...ING, name: "ingest-agent", role: "extract", minStage: 1 },
  { ...MON, name: "monitor-agent", role: "watch price", minStage: 3 },
  { ...CLM, name: "claim-agent", role: "draft claim", minStage: 4 },
];

export const ArchFlow: React.FC<{ litCount: number }> = ({ litCount }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [15, 45], [0, 1], { ...C, easing: easings.easeOut });
  const vis = (minStage: number) => (litCount < minStage ? 0 : litCount === minStage ? enter : 1);
  const sc = (minStage: number) => (litCount === minStage ? 0.85 + 0.15 * enter : 1);
  const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((frame * 2 * Math.PI) / 40));
  const draftChars = Math.max(0, Math.floor(interpolate(frame, [45, 85], [0, 22], C)));

  const cardBase = {
    position: "absolute" as const,
    backgroundColor: colors.bg.surface,
    border: BORDER,
    boxShadow: SHADOW,
    borderRadius: 16,
    fontFamily: FONT_STACK_TEXT,
  };

  const pill = (x: number, y: number, label: string, op: number) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        opacity: op,
        display: "flex",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.bg.surface,
        border: BORDER,
        borderRadius: 999,
        padding: "4px 10px",
        fontFamily: FONT_STACK_TEXT,
        fontSize: 12,
        fontWeight: 600,
        color: colors.brand.primary,
        whiteSpace: "nowrap",
      }}
    >
      <Img src={staticFile("brandlogos/googlepubsub.svg")} style={{ width: 13, height: 13 }} />
      {label}
    </div>
  );

  return (
    <>
      {/* ---- connector layer ---- */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={colors.text.muted} />
          </marker>
        </defs>
        {/* input → ingest */}
        <line x1={INPUT.x + 46} y1={INPUT.y} x2={ING.x - NW / 2 - 6} y2={ING.y} stroke={colors.text.muted} strokeWidth={2} markerEnd="url(#ah)" opacity={0.55 * vis(1)} />
        {/* ingest → monitor (purchase.ingested) */}
        <line x1={ING.x + NW / 2} y1={ING.y} x2={MON.x - NW / 2 - 6} y2={MON.y} stroke={colors.text.muted} strokeWidth={2} markerEnd="url(#ah)" opacity={0.55 * vis(3)} />
        {/* monitor → claim (price.dropped) */}
        <line x1={MON.x + NW / 2} y1={MON.y} x2={CLM.x - NW / 2 - 6} y2={CLM.y} stroke={colors.text.muted} strokeWidth={2} markerEnd="url(#ah)" opacity={0.55 * vis(4)} />
        {/* claim → user (claim.drafted) */}
        <line x1={CLM.x + NW / 2} y1={CLM.y} x2={CLM.x + NW / 2 + 120} y2={CLM.y} stroke={colors.text.muted} strokeWidth={2} markerEnd="url(#ah)" opacity={0.55 * vis(5)} />
        {/* scheduler → monitor */}
        <line x1={SCHED.x} y1={SCHED.y + 36} x2={MON.x} y2={MON.y - NH / 2 - 4} stroke={colors.text.muted} strokeWidth={2} markerEnd="url(#ah)" opacity={0.5 * vis(3)} />
        {/* agents ↔ MongoDB (dashed R/W) */}
        {AGENTS.map((a) => (
          <line key={`m-${a.name}`} x1={a.x} y1={a.y + NH / 2} x2={MONGO.x} y2={MONGO.y - 40} stroke={colors.brand.primary} strokeWidth={1.5} strokeDasharray="5 5" opacity={0.3 * vis(a.minStage === 1 ? 3 : a.minStage)} />
        ))}
        {/* Phoenix trace lines up to each agent */}
        {AGENTS.map((a) => (
          <line key={`p-${a.name}`} x1={a.x} y1={770} x2={a.x} y2={a.y + NH / 2 + 4} stroke={colors.semantic.warning} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.4 * vis(5)} />
        ))}
        {/* sidecar divider */}
        <line x1={1450} y1={150} x2={1450} y2={760} stroke={colors.text.muted} strokeWidth={1} strokeDasharray="2 6" opacity={0.4 * vis(5)} />
      </svg>

      {/* ---- event-name pills on the Pub/Sub arrows ---- */}
      {pill((ING.x + MON.x) / 2, ING.y - 30, "purchase.ingested", vis(3))}
      {pill((MON.x + CLM.x) / 2, MON.y - 30, "price.dropped", vis(4))}
      {pill(CLM.x + NW / 2 + 60, CLM.y - 30, "claim.drafted", vis(5))}

      {/* ---- input chip ---- */}
      <div style={{ ...cardBase, left: INPUT.x - 46, top: INPUT.y - 46, width: 92, height: 92, borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, opacity: vis(1) }}>
        <Img src={staticFile("brandlogos/gmail.svg")} style={{ width: 30, height: 30 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.text.muted }}>Inbox / Upload</span>
      </div>

      {/* ---- 3 workflow agent cards ---- */}
      {AGENTS.map((a) => (
        <div
          key={a.name}
          style={{
            ...cardBase,
            left: a.x - NW / 2,
            top: a.y - NH / 2,
            width: NW,
            height: NH,
            opacity: vis(a.minStage),
            transform: `scale(${sc(a.minStage).toFixed(4)})`,
            transformOrigin: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Img src={staticFile("brandlogos/googlegemini.svg")} style={{ position: "absolute", top: 8, right: 8, width: 16, height: 16 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: colors.text.dark }}>{a.name}</span>
          <span style={{ fontSize: 12, color: colors.text.muted }}>{a.role}</span>
          {a.name === "monitor-agent" && (
            <span style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", backgroundColor: colors.semantic.warning, opacity: litCount >= 3 ? pulse : 0 }} />
          )}
        </div>
      ))}

      {/* ---- field chips out of ingest (stage 2) ---- */}
      {["Merchant", "Item", "Date", "Price"].map((f, j) => {
        const t = vis(2) * interpolate(frame, [40 + j * 7, 64 + j * 7], [0, 1], { ...C, easing: easings.easeOut });
        return (
          <div key={f} style={{ position: "absolute", left: ING.x - 40, top: ING.y + 70 + j * 34, opacity: t, transform: `translateY(${((1 - t) * 6).toFixed(1)}px)`, fontFamily: FONT_STACK_TEXT, fontSize: 12, fontWeight: 500, color: colors.text.dark, backgroundColor: colors.bg.surface, border: BORDER, borderRadius: 999, padding: "4px 12px", boxShadow: "0 3px 10px rgba(15,20,25,0.06)" }}>
            {f}
          </div>
        );
      })}

      {/* ---- Cloud Scheduler clock → monitor ---- */}
      <div style={{ ...cardBase, left: SCHED.x - 70, top: SCHED.y - 26, width: 140, height: 52, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: vis(3) }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.brand.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.text.dark, fontFamily: FONT_STACK_TEXT }}>every 15 min</span>
      </div>

      {/* ---- MongoDB Atlas state store ---- */}
      <div style={{ ...cardBase, left: MONGO.x - 130, top: MONGO.y - 40, width: 260, height: 80, display: "flex", alignItems: "center", gap: 14, padding: "0 20px", opacity: vis(3) }}>
        <Img src={staticFile("brandlogos/mongodb.svg")} style={{ width: 34, height: 34 }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.text.dark }}>MongoDB Atlas</div>
          <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>purchases · claims · policies</div>
        </div>
      </div>

      {/* ---- Phoenix trace band ---- */}
      <div style={{ position: "absolute", left: ING.x - 70, top: 770, width: CLM.x - ING.x + 140, opacity: vis(5), display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: FONT_STACK_TEXT }}>
        <Img src={staticFile("brandlogos/phoenix.png")} style={{ width: 26, height: 26, objectFit: "contain" }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark }}>Phoenix tracing</span>
        <span style={{ fontSize: 12, color: colors.text.muted }}>— every decision, tool call &amp; Gemini draft</span>
      </div>

      {/* ---- Assistant sidecar (NOT in workflow) ---- */}
      <div style={{ ...cardBase, left: ASST.x - 130, top: ASST.y - 70, width: 260, height: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, opacity: vis(5) }}>
        <Img src={staticFile("brandlogos/googlegemini.svg")} style={{ width: 24, height: 24 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: colors.text.dark }}>assistant-agent</span>
        <span style={{ fontSize: 11, color: colors.text.muted, textAlign: "center", lineHeight: 1.35 }}>
          answers your questions —<br />not in the claim workflow
        </span>
      </div>

      {/* ---- draft snippet near claim-agent (stage 4) ---- */}
      {litCount >= 4 && (
        <div style={{ position: "absolute", left: CLM.x - 80, top: CLM.y + 70, width: 200, opacity: vis(4), fontFamily: FONT_STACK_TEXT, fontSize: 11, color: colors.text.muted, backgroundColor: colors.bg.surface, border: BORDER, borderRadius: 10, padding: 10, boxShadow: "0 4px 12px rgba(15,20,25,0.06)", minHeight: 18 }}>
          {"Hello Costco, I purchased…".slice(0, draftChars)}
        </div>
      )}
    </>
  );
};
