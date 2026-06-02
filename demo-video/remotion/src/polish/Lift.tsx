// PILLAR 2 — DEPTH. Card-lift wrapper: applies the 3- or 4-layer
// shadow stack that distinguishes premium UI from "default Tailwind
// shadow." Add `hero` for an extra "vast" 4th shadow on the biggest
// floating cards.

import type { CSSProperties, ReactNode } from "react";
import { SHADOW } from "./tokens";

interface LiftProps {
  children: ReactNode;
  /** Use the 4-layer hero stack. Default: 3-layer card stack. */
  hero?: boolean;
  /** Apply on dark backgrounds (darker shadow values). */
  onDark?: boolean;
  /** Add rim-light highlight on the top edge. */
  rim?: boolean;
  /** Border radius. Default 16. */
  radius?: number;
  /** Background — pass any CSS color/gradient. Default pure white. */
  background?: string;
  style?: CSSProperties;
  className?: string;
}

export const Lift: React.FC<LiftProps> = ({
  children,
  hero,
  onDark,
  rim,
  radius = 16,
  background,
  style,
  className,
}) => {
  const stack = onDark ? SHADOW.cardOnDark : hero ? SHADOW.hero : SHADOW.card;
  const boxShadow = rim ? `${stack}, ${SHADOW.rimLight}` : stack;

  return (
    <div
      className={className}
      style={{
        borderRadius: radius,
        boxShadow,
        background: background ?? "#FFFFFF",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
