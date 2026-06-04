// TechWall — the implementation-proof stack grid. `highlight` scales+rings one
// card (per-tech beats); `revealCount` staggers the materialize.
import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const TECH: [string, string][] = [
  ["googlegemini.svg", "Gemini ADK"],
  ["mongodb.svg", "MongoDB Atlas"],
  ["phoenix.png", "Arize Phoenix"],
  ["googlecloud.svg", "Cloud Run"],
  ["googlepubsub.svg", "Pub/Sub"],
];

export const TechWall: React.FC<{
  highlight?: string;
  revealCount?: number;
  style?: CSSProperties;
}> = ({ highlight, revealCount, style }) => (
  <div
    style={{
      display: "flex",
      gap: 20,
      flexWrap: "wrap",
      justifyContent: "center",
      maxWidth: 920,
      fontFamily: FONT_STACK_TEXT,
      ...style,
    }}
  >
    {TECH.map(([logo, name], i) => {
      const visible = revealCount === undefined ? 1 : i < revealCount ? 1 : 0;
      const hl = highlight === name;
      return (
        <div
          key={name}
          style={{
            width: 200,
            padding: "26px 20px",
            backgroundColor: colors.bg.surface,
            borderRadius: 14,
            border: `1px solid ${hl ? "rgba(39,70,110,0.4)" : "rgba(15,20,25,0.08)"}`,
            boxShadow: hl
              ? "0 0 0 3px rgba(39,70,110,0.12), 0 12px 32px rgba(15,20,25,0.10)"
              : "0 6px 18px rgba(15,20,25,0.06)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            opacity: visible,
            transform: hl ? "scale(1.04)" : "scale(1)",
          }}
        >
          <Img
            src={staticFile(`brandlogos/${logo}`)}
            style={{ height: 40, maxWidth: 120, objectFit: "contain" }}
          />
          <span style={{ fontSize: 15, fontWeight: 600, color: colors.text.dark }}>{name}</span>
        </div>
      );
    })}
  </div>
);
