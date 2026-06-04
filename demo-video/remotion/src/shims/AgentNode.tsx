// AgentNode — diagram node: rounded icon tile + label, with an optional
// amber "thinking" pulse-dot (frame-driven via useCurrentFrame).
import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const AgentNode: React.FC<{
  label: string;
  sublabel?: string;
  pulsing?: boolean;
  style?: CSSProperties;
}> = ({ label, sublabel, pulsing = false, style }) => {
  const frame = useCurrentFrame();
  const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((frame * 2 * Math.PI) / 40));
  return (
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
          position: "relative",
        }}
      >
        <svg
          aria-hidden="true"
          width={34}
          height={34}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.brand.primary}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
        {pulsing && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: colors.semantic.warning,
              opacity: pulse,
            }}
          />
        )}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{sublabel}</div>
        )}
      </div>
    </div>
  );
};
