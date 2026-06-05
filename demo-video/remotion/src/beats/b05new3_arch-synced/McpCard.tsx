// MCP intro card — forked from peer Scene09Sponsors' card styling, but sized
// for the LOWER half of the viewport and revealed individually (one per MCP)
// so each card can land in sync with its architecture node + connection lines.
// The Arize Phoenix card uses OUR brandlogos/phoenix.png (not peer's Flame).
import { Img, staticFile } from "remotion";

import { useReveal } from "../../polish/RevealCard";
import { COLOR, TYPE } from "../../shots/_shared/tokens";

export const McpCard: React.FC<{
  x: number;
  top: number;
  w: number;
  logoFile: string;
  name: string;
  purpose: string;
  fromFrame: number;
}> = ({ x, top, w, logoFile, name, purpose, fromFrame }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top,
        width: w,
        borderRadius: 18,
        background: COLOR.WHITE,
        border: `1px solid ${COLOR.LINE}`,
        boxShadow: "0 24px 60px rgba(20,30,50,0.08)",
        padding: 32,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
      }}
    >
      <Img
        src={staticFile(`brandlogos/${logoFile}`)}
        alt={name}
        style={{ height: 60, width: 60, objectFit: "contain" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ ...TYPE.SUB, fontSize: 26, fontWeight: 700, color: COLOR.INK }}>{name}</span>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            background: COLOR.NAVY_50,
            border: `1px solid ${COLOR.NAVY}`,
            color: COLOR.NAVY,
            fontFamily: TYPE.MICRO.fontFamily,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.5px",
          }}
        >
          MCP
        </span>
      </div>
      <div
        style={{
          ...TYPE.SUB,
          fontSize: 20,
          lineHeight: 1.4,
          color: COLOR.BODY,
          textAlign: "center",
        }}
      >
        {purpose}
      </div>
    </div>
  );
};
