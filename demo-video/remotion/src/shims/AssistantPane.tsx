// AssistantPane — ADAPTED from apps/web assistant-pane.tsx. Sparkles header +
// "Claim-focused" badge, message bubbles (assistant gray / user navy), the
// real 4 quick-action chips (one highlightable), and the input row.
// (Real uses a 🎯 emoji on the badge; replaced with a crosshair icon to avoid
// emoji-font risk in the headless render — minor deviation.)
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

const QUICK_ACTIONS = ["Make it friendlier", "Why this template?", "Explain the policy match", "Switch to manual approval"];

interface Msg {
  role: "assistant" | "user";
  text: string;
}

export const AssistantPane: React.FC<{ messages?: Msg[]; highlightAction?: string; style?: CSSProperties }> = ({
  messages = [],
  highlightAction,
  style,
}) => (
  <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: FONT_STACK_TEXT, ...style }}>
    {/* header */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(15,20,25,0.08)", padding: "11px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.brand.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0Z" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark }}>Assistant</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: colors.brand.primary, backgroundColor: "rgba(39,70,110,0.10)", padding: "3px 10px", borderRadius: 999 }}>
        Claim-focused
      </span>
    </div>

    {/* messages */}
    <div style={{ flex: 1, overflow: "hidden", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.length === 0 ? (
        <span style={{ fontSize: 13, color: colors.text.muted }}>
          Ask about this claim — try a quick action below or type your own question.
        </span>
      ) : (
        messages.map((m, i) => (
          <div key={`${m.role}-${i}`} style={{ display: "flex", justifyContent: m.role === "assistant" ? "flex-start" : "flex-end" }}>
            <div
              style={{
                maxWidth: "82%",
                fontSize: 13,
                lineHeight: 1.5,
                padding: "9px 13px",
                borderRadius: 12,
                backgroundColor: m.role === "assistant" ? "rgba(15,20,25,0.05)" : colors.brand.primary,
                color: m.role === "assistant" ? colors.text.dark : "#FFFFFF",
              }}
            >
              {m.text}
            </div>
          </div>
        ))
      )}
    </div>

    {/* quick actions */}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: "1px solid rgba(15,20,25,0.08)", padding: "10px 14px" }}>
      {QUICK_ACTIONS.map((a) => {
        const hl = a === highlightAction;
        return (
          <span
            key={a}
            style={{
              fontSize: 12,
              fontWeight: hl ? 600 : 500,
              color: hl ? colors.brand.primary : colors.text.muted,
              backgroundColor: hl ? "rgba(39,70,110,0.08)" : colors.bg.surface,
              border: `1px solid ${hl ? "rgba(39,70,110,0.45)" : "rgba(15,20,25,0.12)"}`,
              boxShadow: hl ? "0 0 0 3px rgba(39,70,110,0.12)" : "none",
              borderRadius: 999,
              padding: "5px 12px",
            }}
          >
            {a}
          </span>
        );
      })}
    </div>

    {/* input */}
    <div style={{ borderTop: "1px solid rgba(15,20,25,0.08)", padding: 14, display: "flex", gap: 8 }}>
      <div style={{ flex: 1, fontSize: 13, color: colors.text.muted, border: "1px solid rgba(15,20,25,0.12)", borderRadius: 10, padding: "10px 12px" }}>
        Ask about this claim…
      </div>
      <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.brand.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      </div>
    </div>
  </div>
);
