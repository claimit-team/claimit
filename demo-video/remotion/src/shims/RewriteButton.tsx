// RewriteButton — "Make it friendlier" assistant quick-action chip.
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const RewriteButton: React.FC<{ highlighted?: boolean; style?: CSSProperties }> = ({
  highlighted = false,
  style,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "9px 15px",
      borderRadius: 10,
      border: `1px solid ${highlighted ? "rgba(39,70,110,0.45)" : "rgba(15,20,25,0.12)"}`,
      backgroundColor: highlighted ? "rgba(39,70,110,0.08)" : colors.bg.surface,
      fontFamily: FONT_STACK_TEXT,
      fontSize: 13,
      fontWeight: 500,
      color: highlighted ? colors.brand.primary : colors.text.dark,
      boxShadow: highlighted ? "0 0 0 3px rgba(39,70,110,0.12)" : "none",
      ...style,
    }}
  >
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0Z" />
    </svg>
    Make it friendlier
  </div>
);
