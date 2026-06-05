// Fork of peer Scene07Platforms / FourCardGridLayer — the 4 platform-policy
// types (Email · Chat · In-Store · Self-Service) as a 2×2 grid. Adapted for
// Beat09: transparent root (composes over the logo wall during the push-up
// handoff), row-by-row reveal (row1From / row2From), no headline/closing
// (Beat09 supplies the policy title). Cell visuals copied from peer's layer.
import { interpolate, useCurrentFrame } from "remotion";

import {
  DP6_EMAIL_BODY,
  DP6_EMAIL_SUBJECT,
  DP11_FOUR_TYPES,
  DP12_CHAT,
  DP13_IN_STORE,
  DP14_SELF_SERVICE,
} from "../../shots/_shared/data";
import { COLOR, TYPE } from "../../shots/_shared/tokens";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const iv = (f: number, r: number[], o: number[]) => interpolate(f, r, o, clamp);
const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const FIRST_EMAIL_LINES = DP6_EMAIL_BODY.split("\n\n").slice(0, 2).join("\n\n");

const titleStyle = {
  fontFamily: TYPE.SUB.fontFamily,
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.2,
  color: COLOR.INK,
} as const;
const bodyStyle = {
  fontFamily: TYPE.SUB.fontFamily,
  fontSize: 17,
  fontWeight: 400,
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

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div style={{ ...labelStyle, marginBottom: 4 }}>{title}</div>
    <div style={{ ...bodyStyle, fontSize: 16 }}>{children}</div>
  </div>
);
const NumberedItem: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
    <span style={{ ...labelStyle, color: COLOR.MUTE, textTransform: "none", fontSize: 15 }}>
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
const Chip: React.FC<{ label: string; value: string; tone?: "neutral" | "success" }> = ({
  label,
  value,
  tone = "neutral",
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "baseline",
      gap: 4,
      padding: "4px 10px",
      borderRadius: 6,
      background: tone === "success" ? COLOR.GREEN_05 : COLOR.N100,
      fontFamily: TYPE.SUB.fontFamily,
      fontSize: 13,
      fontWeight: 600,
      color: tone === "success" ? COLOR.GREEN : COLOR.INK,
    }}
  >
    <span style={{ opacity: 0.7 }}>{label}</span>
    <span>{value}</span>
  </span>
);

type CellId = "email" | "chat_script" | "in_store_guide" | "self_service_walkthrough";
const CELLS: { id: CellId; platform: string; type: string; render: () => React.ReactNode }[] = [
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
    platform: "Macy's",
    type: "Chat Script",
    render: () => {
      const lines = DP12_CHAT.body
        .split("\n")
        .filter((l) => l.startsWith("Step "))
        .slice(0, 3);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lines.map((line) => {
            const [step, ...rest] = line.split(":");
            return (
              <div key={step} style={{ display: "flex", gap: 12 }}>
                <span style={{ flexShrink: 0, ...labelStyle, color: COLOR.NAVY }}>
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
                  {rest.join(":").trim()}
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
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

const GRID_LEFT = 80;
const GRID_RIGHT = 1840;
const GAP = 28;
const CELL_W = (GRID_RIGHT - GRID_LEFT - GAP) / 2;
const CELL_H = 356;
const HEADER_H = 52;
const FOOTER_H = 40;

// Beat09 positions the whole grid via a wrapping translateY; GRID_TOP is the
// grid's internal top (row1 = top, row2 = bottom).
export const Scene07PlatformFast: React.FC<{
  gridTop: number;
  row1From: number;
  row2From: number;
}> = ({ gridTop, row1From, row2From }) => {
  const frame = useCurrentFrame();
  const positions: Record<CellId, { x: number; y: number; from: number }> = {
    email: { x: GRID_LEFT, y: gridTop, from: row1From },
    chat_script: { x: GRID_LEFT + CELL_W + GAP, y: gridTop, from: row1From },
    in_store_guide: { x: GRID_LEFT, y: gridTop + CELL_H + GAP, from: row2From },
    self_service_walkthrough: {
      x: GRID_LEFT + CELL_W + GAP,
      y: gridTop + CELL_H + GAP,
      from: row2From,
    },
  };
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {CELLS.map((cell) => {
        const pos = positions[cell.id];
        const op = iv(frame, [pos.from, pos.from + 30], [0, 1]);
        const sharp = iv(frame, [pos.from, pos.from + 44], [0.35, 1]);
        const ty = iv(frame, [pos.from, pos.from + 30], [16, 0]);
        const footerOp = iv(frame, [pos.from + 80, pos.from + 120], [0, 1]);
        const blur = (1 - sharp) * 3;
        return (
          <div
            key={cell.id}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: CELL_W,
              height: CELL_H,
              borderRadius: 14,
              background: COLOR.WHITE,
              boxShadow: "0 24px 60px rgba(20,30,50,0.10)",
              border: `1px solid ${COLOR.LINE}`,
              overflow: "hidden",
              opacity: op,
              filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
              transform: `translateY(${ty.toFixed(1)}px)`,
              display: "flex",
              flexDirection: "column",
            }}
          >
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
              <span style={{ fontSize: 18, fontWeight: 600, color: COLOR.INK }}>
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
            <div style={{ flex: 1, padding: "20px 24px", overflow: "hidden" }}>{cell.render()}</div>
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
              {DP11_FOUR_TYPES.footers[cell.id]}
            </div>
          </div>
        );
      })}
    </div>
  );
};
