// ReceiptVisual — Costco receipt for the Refund hero (iPad Air M2 fixture).
import type { CSSProperties } from "react";

import { colors } from "../polish/tokens";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const ReceiptVisual: React.FC<{ style?: CSSProperties }> = ({ style }) => (
  <div
    style={{
      width: 340,
      backgroundColor: colors.bg.surface,
      borderRadius: 14,
      border: "1px solid rgba(15,20,25,0.08)",
      boxShadow: "0 12px 40px rgba(15,20,25,0.12)",
      padding: "30px 28px",
      fontFamily: MONO,
      color: colors.text.dark,
      ...style,
    }}
  >
    <div style={{ textAlign: "center", fontWeight: 700, fontSize: 18, letterSpacing: "0.06em" }}>
      COSTCO WHOLESALE
    </div>
    <div style={{ textAlign: "center", fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
      MEMBER #111 222 333 444
    </div>
    <div style={{ borderTop: "1px dashed rgba(15,20,25,0.25)", margin: "18px 0" }} />
    <div style={{ fontSize: 13 }}>Apple iPad Air 11&quot; M2</div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
      <span style={{ color: colors.text.muted }}>Item 1820413</span>
      <span>$599.99</span>
    </div>
    <div style={{ borderTop: "1px dashed rgba(15,20,25,0.25)", margin: "18px 0" }} />
    <div
      style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}
    >
      <span>TOTAL</span>
      <span>$599.99</span>
    </div>
    <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 14 }}>
      2026-05-22 · Order 1185402639
    </div>
  </div>
);
