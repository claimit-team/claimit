// PILLAR 3 — MATERIAL. Frosted-glass surface for overlays, toasts,
// dialog backdrops. The saturation boost is what makes it feel like
// real frosted glass instead of "CSS blur."

import type { CSSProperties, ReactNode } from "react";

interface FrostedGlassProps {
  children: ReactNode;
  blurPx?: number;
  /** Film color over the blur. Default 8% white. */
  tint?: string;
  /** Border-radius. Default 16. */
  radius?: number;
  /** Subtle inset highlight on top edge. Default true. */
  rim?: boolean;
  style?: CSSProperties;
}

export const FrostedGlass: React.FC<FrostedGlassProps> = ({
  children,
  blurPx = 20,
  tint = "rgba(255,255,255,0.08)",
  radius = 16,
  rim = true,
  style,
}) => {
  return (
    <div
      style={{
        backdropFilter: `blur(${blurPx}px) saturate(1.2)`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(1.2)`,
        background: tint,
        borderRadius: radius,
        border: rim ? "1px solid rgba(255,255,255,0.12)" : undefined,
        boxShadow: rim ? "inset 0 1px 0 rgba(255,255,255,0.08)" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
