// UploadCard — dropzone with "or read from Gmail inbox" badge.
import type { CSSProperties } from "react";

import { colors, FONT_STACK_TEXT } from "../polish/tokens";

export const UploadCard: React.FC<{ highlightBadge?: boolean; style?: CSSProperties }> = ({
  highlightBadge = false,
  style,
}) => (
  <div style={{ width: 440, fontFamily: FONT_STACK_TEXT, textAlign: "center", ...style }}>
    <div
      style={{
        border: "2px dashed rgba(15,20,25,0.18)",
        borderRadius: 14,
        backgroundColor: colors.bg.surface,
        padding: "40px 24px",
        color: colors.text.muted,
      }}
    >
      <svg
        width={44}
        height={44}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.text.muted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ margin: "0 auto 14px", display: "block" }}
      >
        <path d="M12 13v8" />
        <path d="m8 17 4-4 4 4" />
        <path d="M20 16.5A4.5 4.5 0 0 0 18 8h-1.3A7 7 0 1 0 5 14.3" />
      </svg>
      <div style={{ fontSize: 16, fontWeight: 500, color: colors.text.dark }}>
        Drag receipt or click to upload
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>PDF, PNG, or JPG up to 10 MB</div>
    </div>
    <div style={{ marginTop: 14 }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          padding: "8px 16px",
          borderRadius: 999,
          backgroundColor: highlightBadge ? "rgba(39,70,110,0.12)" : "rgba(15,20,25,0.05)",
          color: highlightBadge ? colors.brand.primary : colors.text.muted,
        }}
      >
        or read it from your Gmail inbox
      </span>
    </div>
  </div>
);
