// PhoenixNode — diagram node with the Arize Phoenix logo + label.
import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const PhoenixNode: React.FC<{
  label?: string;
  sublabel?: string;
  style?: CSSProperties;
}> = ({ label = "Phoenix tracing", sublabel, style }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      fontFamily: FONT_STACK_TEXT,
      ...style,
    }}
  >
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 18,
        backgroundColor: colors.bg.surface,
        border: "1px solid rgba(15,20,25,0.10)",
        boxShadow: "0 6px 18px rgba(15,20,25,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img
        src={staticFile("brandlogos/phoenix.png")}
        style={{ width: 40, height: 40, objectFit: "contain" }}
      />
    </div>
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark }}>{label}</div>
      {sublabel && (
        <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{sublabel}</div>
      )}
    </div>
  </div>
);
