// SentBanner — confirmation toast "Email sent from your Gmail" + green check
// + Gmail logo. The green check is the reclaimed-money green (allowed here).
import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const SentBanner: React.FC<{ style?: CSSProperties }> = ({ style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      padding: "16px 24px",
      borderRadius: 12,
      backgroundColor: colors.bg.surface,
      border: "1px solid rgba(31,122,58,0.3)",
      boxShadow: "0 14px 36px rgba(15,20,25,0.14)",
      fontFamily: FONT_STACK_TEXT,
      ...style,
    }}
  >
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        backgroundColor: colors.brand.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        aria-hidden="true"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: colors.text.dark }}>
        Email sent from your Gmail
      </div>
      <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
        Claim filed · just now
      </div>
    </div>
    <Img
      src={staticFile("brandlogos/gmail.svg")}
      style={{ width: 22, height: 22, marginLeft: 6 }}
    />
  </div>
);
