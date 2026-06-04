// MongoNode — diagram node with the MongoDB logo + label.
import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const MongoNode: React.FC<{ label?: string; sublabel?: string; style?: CSSProperties }> = ({
  label = "MongoDB Atlas",
  sublabel,
  style,
}) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontFamily: FONT_STACK_TEXT, ...style }}>
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
      <Img src={staticFile("brandlogos/mongodb.svg")} style={{ width: 38, height: 38 }} />
    </div>
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark }}>{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{sublabel}</div>}
    </div>
  </div>
);
