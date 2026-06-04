// ClaimsListRow — one row in the claims list with a status badge.
// "Resolved" uses the reclaimed-money green (it IS the money-back outcome).
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

type Status = "sent" | "pending" | "resolved";
const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  sent: { label: "Sent", color: colors.brand.primary, bg: "rgba(39,70,110,0.10)" },
  pending: { label: "Pending", color: colors.semantic.warning, bg: "rgba(245,158,11,0.14)" },
  resolved: { label: "Resolved", color: colors.brand.accent, bg: "rgba(31,122,58,0.12)" },
};

export const ClaimsListRow: React.FC<{
  platform: string;
  item: string;
  status: Status;
  amount: string;
  style?: CSSProperties;
}> = ({ platform, item, status, amount, style }) => {
  const s = STATUS[status];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        backgroundColor: colors.bg.surface,
        border: "1px solid rgba(15,20,25,0.08)",
        borderRadius: 12,
        fontFamily: FONT_STACK_TEXT,
        ...style,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: colors.text.dark }}>{item}</span>
        <span style={{ fontSize: 12, color: colors.text.muted }}>{platform}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: status === "resolved" ? colors.brand.accent : colors.text.dark,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {amount}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: s.color, backgroundColor: s.bg, padding: "4px 12px", borderRadius: 999 }}>
          {s.label}
        </span>
      </div>
    </div>
  );
};
