// PolicyBadge — Costco price-adjustment policy badge (b18).
// Checkmark is navy (NOT green) — green is reserved for the reclaimed-money
// moment (ApproveButton / SentBanner) per the audit constraint.
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const PolicyBadge: React.FC<{ checked?: boolean; style?: CSSProperties }> = ({
  checked = false,
  style,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.bg.surface,
      borderRadius: 14,
      border: "1px solid rgba(15,20,25,0.08)",
      boxShadow: "0 8px 24px rgba(15,20,25,0.06)",
      padding: "20px 26px",
      fontFamily: FONT_STACK_TEXT,
      ...style,
    }}
  >
    <svg
      aria-hidden="true"
      width={30}
      height={30}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.brand.primary}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
    </svg>
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, color: colors.text.dark }}>
        Costco · 30-day price adjustment
      </div>
      <div style={{ fontSize: 13, color: colors.text.muted, marginTop: 2 }}>
        Refund issued as member credit
      </div>
    </div>
    {checked && (
      <svg
        aria-hidden="true"
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.brand.primary}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginLeft: 10 }}
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    )}
  </div>
);
