// EmailDraft — ADAPTED to apps/web draft-pane.tsx: pane header ("Email Draft"
// + version dropdown), Preview/Edit tabs, then the To/Subject card + body.
// `typedChars` drives the typewriter; `mode` toggles Preview/Edit chrome.
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const EmailDraft: React.FC<{
  body: string;
  to?: string;
  subject?: string;
  typedChars?: number;
  versionLabel?: string;
  mode?: "preview" | "edit";
  style?: CSSProperties;
}> = ({
  body,
  to = "pricematch@costco.com",
  subject = "Price adjustment request — order 1185402639",
  typedChars,
  versionLabel = "v2 of 2 · assistant",
  mode = "preview",
  style,
}) => {
  const shown = typedChars === undefined ? body : body.slice(0, Math.max(0, typedChars));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: FONT_STACK_TEXT,
        ...style,
      }}
    >
      {/* pane header + version dropdown */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid rgba(15,20,25,0.08)",
          padding: "11px 16px",
        }}
      >
        <svg
          aria-hidden="true"
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.text.muted}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.dark }}>Email Draft</span>
        <span
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: colors.text.muted,
            border: "1px solid rgba(15,20,25,0.12)",
            borderRadius: 8,
            padding: "3px 10px",
          }}
        >
          {versionLabel}
          <svg
            aria-hidden="true"
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
      {/* tabs */}
      <div
        style={{
          display: "flex",
          gap: 20,
          borderBottom: "1px solid rgba(15,20,25,0.08)",
          padding: "0 16px",
        }}
      >
        {(["Preview", "Edit"] as const).map((t) => {
          const active = t.toLowerCase() === mode;
          return (
            <div
              key={t}
              style={{
                padding: "9px 2px",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? colors.brand.primary : colors.text.muted,
                borderBottom: active
                  ? `2px solid ${colors.brand.primary}`
                  : "2px solid transparent",
              }}
            >
              {t}
            </div>
          );
        })}
      </div>
      {/* body */}
      <div style={{ flex: 1, overflow: "hidden", padding: 16 }}>
        <div
          style={{
            backgroundColor: "rgba(15,20,25,0.03)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: colors.text.muted, width: 56 }}>To</span>
            <span style={{ color: colors.text.dark }}>{to}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <span style={{ color: colors.text.muted, width: 56 }}>Subject</span>
            <span style={{ color: colors.text.dark, fontWeight: 500 }}>{subject}</span>
          </div>
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: colors.text.dark,
            whiteSpace: "pre-wrap",
            ...(mode === "edit"
              ? {
                  border: "1px solid rgba(39,70,110,0.35)",
                  borderRadius: 8,
                  padding: 12,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                }
              : {}),
          }}
        >
          {shown}
        </div>
      </div>
    </div>
  );
};
