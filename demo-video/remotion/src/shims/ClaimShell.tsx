// ClaimShell v2 — ADAPTED to the real apps/web 3-pane claim review
// (src/components/claims/claim-detail-shell.tsx). Real layout:
//   ClaimHeader bar on top, then Draft (40%) | right column (60%) split into
//   Evidence (60%) over Assistant (40%). Panes are flush white columns with
//   hairline dividers on a neutral-50 page — NOT rounded cards.
// Direct import of the production component is impractical (zustand stores,
// react-resizable-panels, API hooks) → rebuilt the visual faithfully.
import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const DIV = "1px solid rgba(15,20,25,0.08)";

export const ClaimShell: React.FC<{
  draft?: ReactNode;
  evidence?: ReactNode;
  assistant?: ReactNode;
  status?: string;
}> = ({ draft, evidence, assistant, status = "Draft" }) => (
  <AbsoluteFill style={{ backgroundColor: colors.bg.light, fontFamily: FONT_STACK_TEXT }}>
    {/* ClaimHeader bar */}
    <div
      style={{
        height: 60,
        backgroundColor: colors.bg.surface,
        borderBottom: DIV,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 14,
      }}
    >
      <svg
        aria-hidden="true"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.text.muted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: colors.text.dark }}>
          Apple iPad Air 11&quot; M2
        </div>
        <div style={{ fontSize: 12, color: colors.text.muted }}>Costco · price adjustment</div>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: colors.brand.primary,
          backgroundColor: "rgba(39,70,110,0.10)",
          padding: "4px 12px",
          borderRadius: 999,
        }}
      >
        {status}
      </span>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          backgroundColor: colors.brand.primary,
          color: "#FFFFFF",
          fontSize: 14,
          fontWeight: 600,
          padding: "9px 18px",
          borderRadius: 10,
        }}
      >
        <svg
          aria-hidden="true"
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
        Approve &amp; send
      </div>
    </div>

    {/* panes */}
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div
        style={{
          width: "40%",
          backgroundColor: colors.bg.surface,
          borderRight: DIV,
          overflow: "hidden",
        }}
      >
        {draft}
      </div>
      <div
        style={{
          width: "60%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          backgroundColor: colors.bg.light,
        }}
      >
        <div
          style={{
            height: "60%",
            backgroundColor: colors.bg.surface,
            borderBottom: DIV,
            overflow: "hidden",
          }}
        >
          {evidence}
        </div>
        <div style={{ height: "40%", backgroundColor: colors.bg.surface, overflow: "hidden" }}>
          {assistant}
        </div>
      </div>
    </div>
  </AbsoluteFill>
);
