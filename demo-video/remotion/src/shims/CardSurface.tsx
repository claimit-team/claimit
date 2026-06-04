// CardSurface — base light-mode card matching apps/web (rounded-xl 14px,
// hairline ring border, soft shadow). Reused by most Refund-demo shims.
import type { CSSProperties, ReactNode } from "react";

import { colors } from "../polish/tokens";

export const CardSurface: React.FC<{
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}> = ({ children, padding = 24, style }) => (
  <div
    style={{
      backgroundColor: colors.bg.surface,
      borderRadius: 14,
      border: "1px solid rgba(15,20,25,0.08)",
      boxShadow: "0 1px 2px rgba(15,20,25,0.04), 0 8px 24px rgba(15,20,25,0.06)",
      padding,
      ...style,
    }}
  >
    {children}
  </div>
);
