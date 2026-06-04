// Stylized "Costco receipt" card for Beat06 — polished (Apple-tier), not
// thermal-printer realism. Fixed intrinsic 360×480; the beat wraps it in an
// animated container for the pop / move / scale. Data = Costco iPad fixture.
import { Img, staticFile } from "remotion";

import { FONT_STACK_TEXT } from "../../polish/tokens";

export const RECEIPT_W = 360;
export const RECEIPT_H = 480;

const INK = "#1A2230";
const MUTE = "#9AA3B2";
const FAINT = "#C7CDD8";
const LINE = "#EAEDF2";

const Row: React.FC<{ left: React.ReactNode; right?: React.ReactNode; bold?: boolean; size?: number; color?: string }> = ({
  left,
  right,
  bold,
  size = 13,
  color = INK,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: size, fontWeight: bold ? 700 : 500, color }}>
    <span>{left}</span>
    {right != null ? <span style={{ fontVariantNumeric: "tabular-nums" }}>{right}</span> : null}
  </div>
);

export const ReceiptCard: React.FC = () => (
  <div
    style={{
      width: RECEIPT_W,
      height: RECEIPT_H,
      background: "#FFFFFF",
      borderRadius: 18,
      border: "1px solid rgba(15,23,42,0.07)",
      boxShadow: "0 26px 64px rgba(15,23,42,0.22)",
      padding: "28px 26px 22px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      fontFamily: FONT_STACK_TEXT,
      color: INK,
    }}
  >
    {/* Header — Costco mark + WHOLESALE wordmark */}
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
      <Img src={staticFile("brandlogos/costco.svg")} style={{ height: 30, objectFit: "contain" }} />
      <div style={{ fontSize: 10, letterSpacing: 4, color: MUTE, fontWeight: 700 }}>WHOLESALE</div>
    </div>

    <div style={{ borderTop: `1px dashed ${FAINT}`, margin: "18px 0 14px" }} />

    {/* Meta */}
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTE, fontWeight: 600 }}>
      <span>ORDER 1185402639</span>
      <span>05/22/2026</span>
    </div>

    {/* Line item */}
    <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      <Row left={'Apple iPad Air 11" M2'} right="$599.99" bold size={14} />
      <div style={{ fontSize: 11, color: MUTE }}>128GB · Wi-Fi · Space Gray</div>
      <div style={{ fontSize: 11, color: FAINT }}>Item 1820413</div>

      <div style={{ borderTop: `1px solid ${LINE}`, margin: "14px 0 0" }} />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <Row left="Subtotal" right="$599.99" size={12} color={MUTE} />
        <Row left="Member · Executive" right="—" size={12} color={MUTE} />
      </div>
    </div>

    {/* Total */}
    <div style={{ borderTop: `2px solid ${INK}`, paddingTop: 12, marginTop: 8 }}>
      <Row left="TOTAL" right="$599.99" bold size={19} />
    </div>

    {/* Barcode */}
    <div
      style={{
        marginTop: 16,
        height: 34,
        background:
          "repeating-linear-gradient(90deg, #20283A 0 2px, #FFFFFF 2px 4px, #20283A 4px 7px, #FFFFFF 7px 9px, #20283A 9px 10px, #FFFFFF 10px 13px)",
        borderRadius: 2,
        opacity: 0.92,
      }}
    />
    <div style={{ textAlign: "center", fontSize: 9, letterSpacing: 2, color: MUTE, marginTop: 6 }}>
      1185402639
    </div>
  </div>
);
