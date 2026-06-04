// AppShell — sidebar (ClaimIt logo + nav) + content area, matching apps/web
// authenticated chrome. Light mode.
import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const NAV = ["Dashboard", "Claims", "Purchases", "Assistant"];

export const AppShell: React.FC<{ children: ReactNode; active?: string }> = ({
  children,
  active = "Dashboard",
}) => (
  <AbsoluteFill style={{ flexDirection: "row", fontFamily: FONT_STACK_TEXT }}>
    {/* Sidebar */}
    <div
      style={{
        width: 240,
        backgroundColor: colors.bg.surface,
        borderRight: "1px solid rgba(15,20,25,0.08)",
        padding: "28px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: colors.brand.primary,
          marginBottom: 28,
        }}
      >
        ClaimIt
      </div>
      {NAV.map((item) => (
        <div
          key={item}
          style={{
            fontSize: 15,
            fontWeight: 500,
            padding: "10px 12px",
            borderRadius: 8,
            color: item === active ? colors.brand.primary : colors.text.muted,
            backgroundColor: item === active ? "rgba(39,70,110,0.08)" : "transparent",
          }}
        >
          {item}
        </div>
      ))}
    </div>
    {/* Content */}
    <div style={{ flex: 1, padding: 48, overflow: "hidden", color: colors.text.dark }}>
      {children}
    </div>
  </AbsoluteFill>
);
