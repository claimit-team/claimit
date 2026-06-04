// OcrFieldsCard — extracted-fields list (Merchant / Item / Date / Price).
// `revealCount` controls how many rows are visible (drives the b13 stagger);
// `editable` swaps the "extracted" pill for an edit pencil (b14).
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const FIELDS: [string, string][] = [
  ["Merchant", "Costco"],
  ["Item", 'Apple iPad Air 11" M2'],
  ["Date", "2026-05-22"],
  ["Price", "$599.99"],
];

export const OcrFieldsCard: React.FC<{
  revealCount?: number;
  editable?: boolean;
  style?: CSSProperties;
}> = ({ revealCount = 4, editable = false, style }) => (
  <div
    style={{
      width: 440,
      backgroundColor: colors.bg.surface,
      borderRadius: 14,
      border: "1px solid rgba(15,20,25,0.08)",
      boxShadow: "0 8px 24px rgba(15,20,25,0.06)",
      padding: 26,
      fontFamily: FONT_STACK_TEXT,
      ...style,
    }}
  >
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: colors.text.muted,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: 12,
      }}
    >
      Extracted details
    </div>
    {FIELDS.map(([label, val], i) => (
      <div
        key={label}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "13px 0",
          borderTop: i > 0 ? "1px solid rgba(15,20,25,0.06)" : "none",
          opacity: i < revealCount ? 1 : 0,
        }}
      >
        <span style={{ fontSize: 13, color: colors.text.muted }}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: colors.text.dark }}>{val}</span>
          {editable ? (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={colors.text.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          ) : (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: colors.brand.primary,
                backgroundColor: "rgba(39,70,110,0.10)",
                padding: "2px 7px",
                borderRadius: 4,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              extracted
            </span>
          )}
        </span>
      </div>
    ))}
  </div>
);
