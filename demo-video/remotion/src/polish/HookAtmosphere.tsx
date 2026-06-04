// HookAtmosphere — light-mode backdrop shared by all HOOK beats (1-4) and
// reused as the base light atmosphere across later sections.
//
// Batch C v1.1: switched from the dark grain/scanline treatment to a clean
// light backdrop matching apps/web (bg ≈ #FAFBFC). Film grain + scan lines
// were dropped (they read as "dirty" on light). Only a very subtle vignette
// remains. No frame-driven layers needed now.

import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { colors } from "./tokens";

export const HookAtmosphere: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg.light }}>
      {/* Subtle vignette — corners ~5% darker than the center */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.05) 100%)",
        }}
      />
      {/* Content above the atmosphere */}
      {children}
    </AbsoluteFill>
  );
};
