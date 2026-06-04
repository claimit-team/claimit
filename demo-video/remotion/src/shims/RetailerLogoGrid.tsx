// RetailerLogoGrid — 26 mapped retailers (5 real logos + 21 text placeholders).
// `revealCount` staggers entry; `showChannelPills` adds auto-send (green) /
// chat-script (gray) pills for the b29 credibility beat.
import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const REAL: Record<string, string> = {
  costco: "costco.svg",
  best_buy: "bestbuy.svg",
  target: "target.svg",
  macys: "macys.svg",
  dell: "dell.svg",
};

// 26 mapped retailers (matches seed/policies/*).
const RETAILERS: [string, string][] = [
  ["costco", "Costco"], ["best_buy", "Best Buy"], ["target", "Target"], ["macys", "Macy's"], ["dell", "Dell"],
  ["amazon", "Amazon"], ["walmart", "Walmart"], ["home_depot", "Home Depot"], ["lowes", "Lowe's"], ["nordstrom", "Nordstrom"],
  ["newegg", "Newegg"], ["crutchfield", "Crutchfield"], ["staples", "Staples"], ["jcpenney", "JCPenney"], ["dicks_sporting_goods", "Dick's"],
  ["marriott", "Marriott"], ["hilton", "Hilton"], ["hyatt", "Hyatt"], ["ihg", "IHG"], ["wyndham", "Wyndham"],
  ["delta", "Delta"], ["united", "United"], ["american", "American"], ["southwest", "Southwest"], ["alaska", "Alaska"], ["jetblue", "JetBlue"],
];

const AUTOSEND = new Set(["costco", "macys", "dell"]);
const CHAT = new Set(["best_buy", "target"]);

export const RetailerLogoGrid: React.FC<{
  revealCount?: number;
  showChannelPills?: boolean;
  style?: CSSProperties;
}> = ({ revealCount, showChannelPills = false, style }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 150px)", gap: 14, fontFamily: FONT_STACK_TEXT, ...style }}>
    {RETAILERS.map(([key, name], i) => {
      const visible = revealCount === undefined ? 1 : i < revealCount ? 1 : 0;
      const logo = REAL[key];
      const pill = AUTOSEND.has(key) ? "auto-send" : CHAT.has(key) ? "chat script" : null;
      return (
        <div
          key={key}
          style={{
            height: showChannelPills ? 100 : 76,
            backgroundColor: colors.bg.surface,
            border: "1px solid rgba(15,20,25,0.08)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: visible,
            padding: 8,
          }}
        >
          {logo ? (
            <Img src={staticFile(`brandlogos/${logo}`)} style={{ height: 22, maxWidth: 112, objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text.muted, textAlign: "center" }}>{name}</span>
          )}
          {showChannelPills && pill && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 999,
                color: AUTOSEND.has(key) ? colors.brand.accent : colors.text.muted,
                backgroundColor: AUTOSEND.has(key) ? "rgba(31,122,58,0.12)" : "rgba(15,20,25,0.06)",
              }}
            >
              {pill}
            </span>
          )}
        </div>
      );
    })}
  </div>
);
