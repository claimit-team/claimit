// FourCardGridLayer — Shots 13–14 grid. 2×2 of platform "format
// preview" cards. Per P3 review, each cell shows a COMPACT mini-
// summary (header strip + 2–3 key lines at a larger font) — NOT a
// full DraftPane mount. Goal: "see four distinct claim formats at
// a glance," not read full text.
//
// The four shapes:
//   • Email     — To / Subject / first body line
//   • Chat      — Step 1 / Step 2 / Step 3 stacked
//   • In-Store  — ## title + bold section headers + a hint line
//   • Self-Serve — header chip + PAID/NOW/SAVE chips + first 2 steps
//
// Brightness / sharpness per cell is still driven by Shot 13/14
// frame state (active cell sharp, others dim 0.35 with blur 3px).

import {
  DP6_EMAIL_BODY,
  DP6_EMAIL_SUBJECT,
  DP11_FOUR_TYPES,
  DP12_CHAT,
  DP13_IN_STORE,
  DP14_SELF_SERVICE,
} from "../../shots/_shared/data";
import { COLOR, TYPE, WINDOW } from "../../shots/_shared/tokens";
import type { Act3FrameState, Act3GridCellId } from "../../shots/_shared/types";

interface CellDef {
  id: Act3GridCellId;
  platform: string;
  type: string;
  render: (bodyArea: { width: number; height: number }) => React.ReactNode;
}

// First body line of the email (up to first blank-line break) so the
// Email cell echoes a tiny preview rather than the full message.
const FIRST_EMAIL_LINES = DP6_EMAIL_BODY.split("\n\n").slice(0, 2).join("\n\n");

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

// Typography helpers — bigger than the DraftPane's default 14 px so
// the cell content reads at a glance.
const titleStyle = {
  fontFamily: TYPE.SUB.fontFamily,
  fontSize: 18,
  fontWeight: 600,
  letterSpacing: 0,
  lineHeight: 1.2,
  color: COLOR.INK,
} as const;
const bodyStyle = {
  fontFamily: TYPE.SUB.fontFamily,
  fontSize: 17,
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: 1.45,
  color: COLOR.BODY,
} as const;
const labelStyle = {
  fontFamily: TYPE.SUB.fontFamily,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.4,
  lineHeight: 1.2,
  color: COLOR.NAVY,
  textTransform: "uppercase" as const,
};

const CELLS: CellDef[] = [
  {
    id: "email",
    platform: "Best Buy",
    type: "Email",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            background: COLOR.N50,
            border: `1px solid ${COLOR.LINE}`,
            borderRadius: 8,
            padding: "12px 16px",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "6px 16px",
            ...bodyStyle,
            fontSize: 15,
          }}
        >
          <span style={{ color: COLOR.MUTE, fontWeight: 500 }}>To:</span>
          <span style={{ color: COLOR.INK }}>customercare@bestbuy.com</span>
          <span style={{ color: COLOR.MUTE, fontWeight: 500 }}>Subject:</span>
          <span style={{ color: COLOR.INK }}>{DP6_EMAIL_SUBJECT}</span>
        </div>
        <div
          style={{
            ...bodyStyle,
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {FIRST_EMAIL_LINES}
        </div>
      </div>
    ),
  },
  {
    id: "chat_script",
    platform: "Amazon",
    type: "Chat Script",
    render: () => {
      const lines = DP12_CHAT.body.split("\n").filter((l) => l.startsWith("Step "));
      const top = lines.slice(0, 3);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {top.map((line) => {
            const [step, ...rest] = line.split(":");
            const body = rest.join(":").trim();
            return (
              <div key={step} style={{ display: "flex", gap: 12 }}>
                <span
                  style={{
                    flexShrink: 0,
                    ...labelStyle,
                    color: COLOR.NAVY,
                  }}
                >
                  {step.replace("Step ", "").trim()}
                </span>
                <span
                  style={{
                    ...bodyStyle,
                    flex: 1,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {body}
                </span>
              </div>
            );
          })}
        </div>
      );
    },
  },
  {
    id: "in_store_guide",
    platform: "Target",
    type: "In-Store",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...titleStyle, fontSize: 20 }}>In-Store Price Match Guide</div>
        <Section title="What to Say">
          Hi, I'd like to request a Target price match for an item that's now listed at a lower
          price.
        </Section>
        <Section title="What to Bring">
          • Order confirmation · Screenshot of the lower price ({fmtMoney(DP13_IN_STORE.current)})
        </Section>
      </div>
    ),
  },
  {
    id: "self_service_walkthrough",
    platform: "Southwest",
    type: "Self-Service",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ ...titleStyle, fontSize: 24 }}>{DP14_SELF_SERVICE.header}</span>
          <Chip label="PAID" value={DP14_SELF_SERVICE.paid.toFixed(2)} />
          <Chip label="NOW" value={DP14_SELF_SERVICE.current.toFixed(2)} />
          <Chip
            label="SAVE"
            value={`${DP14_SELF_SERVICE.save.toFixed(2)} ${DP14_SELF_SERVICE.saveCurrency}`}
            tone="success"
          />
        </div>
        <NumberedItem n={1}>{DP14_SELF_SERVICE.steps[0]}</NumberedItem>
        <NumberedItem n={2}>{DP14_SELF_SERVICE.steps[1]}</NumberedItem>
      </div>
    ),
  },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div style={{ ...labelStyle, marginBottom: 4 }}>{title}</div>
    <div style={{ ...bodyStyle, fontSize: 16 }}>{children}</div>
  </div>
);

const NumberedItem: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
    <span
      style={{
        ...labelStyle,
        color: COLOR.MUTE,
        textTransform: "none",
        fontSize: 15,
      }}
    >
      {n}.
    </span>
    <span
      style={{
        ...bodyStyle,
        fontSize: 16,
        flex: 1,
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
      }}
    >
      {children}
    </span>
  </div>
);

const Chip: React.FC<{
  label: string;
  value: string;
  tone?: "neutral" | "success";
}> = ({ label, value, tone = "neutral" }) => {
  const bg = tone === "success" ? COLOR.GREEN_05 : COLOR.N100;
  const fg = tone === "success" ? COLOR.GREEN : COLOR.INK;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 6,
        background: bg,
        fontFamily: TYPE.SUB.fontFamily,
        fontSize: 13,
        fontWeight: 600,
        color: fg,
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span>{value}</span>
    </span>
  );
};

export const FourCardGridLayer: React.FC<{ state: Act3FrameState }> = ({ state }) => {
  // Grid area: y[170, 1010], gaps 32 px
  const GRID_TOP = 170;
  const GRID_BOTTOM = 1010;
  const GRID_LEFT = 80;
  const GRID_RIGHT = WINDOW.NATIVE_W - 80;
  const GAP = 32;
  const cellW = (GRID_RIGHT - GRID_LEFT - GAP) / 2; // ≈ 736
  const cellH = (GRID_BOTTOM - GRID_TOP - GAP) / 2; // ≈ 404

  // Cell internal layout
  const HEADER_H = 52;
  const FOOTER_H = 40;
  const bodyH = cellH - HEADER_H - FOOTER_H;
  const bodyPadX = 24;
  const bodyPadY = 20;

  const positions: Record<Act3GridCellId, { x: number; y: number }> = {
    email: { x: GRID_LEFT, y: GRID_TOP },
    chat_script: { x: GRID_LEFT + cellW + GAP, y: GRID_TOP },
    in_store_guide: { x: GRID_LEFT, y: GRID_TOP + cellH + GAP },
    self_service_walkthrough: {
      x: GRID_LEFT + cellW + GAP,
      y: GRID_TOP + cellH + GAP,
    },
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: COLOR.N50 }}>
      {/* Headline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 96 - 24,
          textAlign: "center",
          ...TYPE.HEADLINE,
          color: COLOR.INK,
          opacity: state.gridTopLabelOpacity,
          transform: `translateY(${state.gridTopLabelY}px)`,
        }}
      >
        {DP11_FOUR_TYPES.headline}
      </div>

      {/* Cells */}
      {CELLS.map((cell) => {
        const pos = positions[cell.id];
        const sharp = state.gridCellSharp[cell.id];
        const cellOp = state.gridCellOpacity[cell.id];
        const blur = (1 - sharp) * 3;
        const footer = DP11_FOUR_TYPES.footers[cell.id];
        const footerOp = state.gridCellFooterOpacity[cell.id];
        return (
          <div
            key={cell.id}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: cellW,
              height: cellH,
              borderRadius: 14,
              background: COLOR.WHITE,
              boxShadow: "0 24px 60px rgba(20,30,50,0.10)",
              overflow: "hidden",
              opacity: cellOp,
              filter: blur ? `blur(${blur.toFixed(2)}px)` : "none",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header strip — platform + type */}
            <div
              style={{
                height: HEADER_H,
                padding: "0 24px",
                borderBottom: `1px solid ${COLOR.LINE}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: TYPE.SUB.fontFamily,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: COLOR.INK,
                }}
              >
                {cell.platform}
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: COLOR.MUTE,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {cell.type}
              </span>
            </div>

            {/* Body — compact mini-summary */}
            <div
              style={{
                flex: 1,
                padding: `${bodyPadY}px ${bodyPadX}px`,
                overflow: "hidden",
              }}
            >
              {cell.render({
                width: cellW - bodyPadX * 2,
                height: bodyH - bodyPadY * 2,
              })}
            </div>

            {/* Footer micro-label */}
            <div
              style={{
                height: FOOTER_H,
                padding: "0 24px",
                borderTop: `1px solid ${COLOR.LINE}`,
                ...TYPE.MICRO,
                fontSize: 14,
                color: COLOR.MUTE,
                opacity: footerOp,
                background: COLOR.N50,
                display: "flex",
                alignItems: "center",
              }}
            >
              {footer}
            </div>
          </div>
        );
      })}

      {/* Closing caption */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1010 - 30,
          textAlign: "center",
          ...TYPE.MICRO,
          fontSize: 16,
          color: COLOR.MUTE,
          opacity: state.gridClosingOpacity,
        }}
      >
        {DP11_FOUR_TYPES.closing}
      </div>
    </div>
  );
};
