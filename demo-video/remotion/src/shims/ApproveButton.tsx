// ApproveButton — large primary CTA in the RECLAIMED-MONEY GREEN
// (colors.brand.accent). This is the ONE green moment in HOOK/Arch/Refund
// (with SentBanner's check). `fillProgress` (0..1) sweeps a light overlay
// across on click.
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const ApproveButton: React.FC<{
  fillProgress?: number;
  label?: string;
  style?: CSSProperties;
}> = ({ fillProgress = 0, label = "Approve & send", style }) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: "16px 38px",
      borderRadius: 12,
      backgroundColor: colors.brand.accent,
      color: "#FFFFFF",
      fontFamily: FONT_STACK_TEXT,
      fontSize: 18,
      fontWeight: 600,
      boxShadow: "0 10px 28px rgba(31,122,58,0.32)",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "rgba(255,255,255,0.2)",
        transform: `translateX(${(fillProgress - 1) * 100}%)`,
      }}
    />
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative" }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
    <span style={{ position: "relative" }}>{label}</span>
  </div>
);
