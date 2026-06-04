// EvidencePane — ADAPTED from apps/web evidence-pane.tsx. Three cards:
// Current price (TrendingDown + paid/current/-diff + screenshot + source),
// Costco price-match policy (highlighted clause), original purchase (grid).
import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const CARD = {
  backgroundColor: colors.bg.surface,
  border: "1px solid rgba(15,20,25,0.10)",
  borderRadius: 14,
  padding: 16,
} as const;
const muted = { color: colors.text.muted } as const;

export const EvidencePane: React.FC = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      fontFamily: FONT_STACK_TEXT,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid rgba(15,20,25,0.08)",
        padding: "11px 16px",
      }}
    >
      <svg
        aria-hidden="true"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.text.muted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <path d="M14 2v6h6" />
      </svg>
      <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark }}>Evidence</span>
    </div>

    <div
      style={{
        flex: 1,
        overflow: "hidden",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Current price */}
      <div style={CARD}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: colors.text.muted,
            marginBottom: 10,
          }}
        >
          <svg
            aria-hidden="true"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.semantic.warning}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 17h6v-6" />
            <path d="m22 17-8.5-8.5-5 5L2 7" />
          </svg>
          Current price
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, ...muted, fontVariantNumeric: "tabular-nums" }}>
              Original: $599.99
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: colors.text.dark,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              $499.99
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: colors.semantic.warning,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              -$100.00
            </div>
            <div style={{ fontSize: 11, ...muted }}>difference</div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
            fontSize: 11,
            ...muted,
          }}
        >
          <span>
            Source: <span style={{ color: colors.brand.primary }}>costco.com</span>
          </span>
          <span>May 31, 2026</span>
        </div>
      </div>

      {/* Policy */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.muted, marginBottom: 8 }}>
          costco price match policy
        </div>
        <div
          style={{
            borderLeft: `4px solid ${colors.semantic.warning}`,
            backgroundColor: "rgba(245,158,11,0.10)",
            borderRadius: "0 6px 6px 0",
            padding: "8px 12px",
            fontSize: 13,
            fontStyle: "italic",
            color: colors.text.dark,
            lineHeight: 1.4,
          }}
        >
          Members can request a price adjustment within 30 days if the price drops at Costco; refund
          is issued as member account credit.
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.brand.primary, marginTop: 8 }}>
          Read costco policy →
        </div>
      </div>

      {/* Original purchase */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.muted, marginBottom: 10 }}>
          Your original purchase
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            ["Purchase date", "May 22, 2026"],
            ["Order ID", "1185402639"],
            ["Price paid", "$599.99"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={muted}>{k}</span>
              <span
                style={{
                  color: colors.text.dark,
                  fontFamily: k === "Order ID" ? "ui-monospace, monospace" : FONT_STACK_TEXT,
                  fontWeight: k === "Price paid" ? 600 : 400,
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);
