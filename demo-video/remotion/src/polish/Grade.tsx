// PILLAR 7 — COLOR GRADE. Outermost wrapper on every section so every
// frame looks like it came from the same camera.
//
// When sections are assembled into the root film, the root applies one
// outer Grade. To avoid the double-grade compounding (saturation²,
// contrast²), each section's inner Grade checks a context provider —
// if it's inside a root Grade, the inner one renders children
// pass-through.

import { type CSSProperties, createContext, type ReactNode, useContext } from "react";
import { AbsoluteFill } from "remotion";

interface GradeContextValue {
  isRoot: boolean;
}

const GradeContext = createContext<GradeContextValue>({ isRoot: false });

interface GradeProps {
  children: ReactNode;
  /** Override the default filter — sections that need lift bump brightness, sections that need quiet drop saturation. */
  filter?: string;
  /** Skip the vignette layer (rare — pure-typography sections). */
  noVignette?: boolean;
  style?: CSSProperties;
  /** Marks this Grade as the root-level wrapper. Inner Grades will no-op. */
  isRoot?: boolean;
}

const DEFAULT_FILTER = [
  "saturate(1.08)",
  "contrast(1.04)",
  "brightness(0.98)",
  "hue-rotate(-2deg)",
].join(" ");

export const Grade: React.FC<GradeProps> = ({ children, filter, noVignette, style, isRoot }) => {
  const ctx = useContext(GradeContext);
  // If this Grade is inside a root Grade and not itself the root, pass
  // through — children render with no extra filter or vignette.
  if (ctx.isRoot && !isRoot) {
    return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
  }
  return (
    <GradeContext.Provider value={{ isRoot: isRoot ?? ctx.isRoot }}>
      <AbsoluteFill
        style={{
          filter: filter ?? DEFAULT_FILTER,
          ...style,
        }}
      >
        {children}
        {!noVignette && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 1400px 900px at center, transparent 55%, rgba(0,0,0,0.18) 100%)",
              zIndex: 9998,
            }}
            aria-hidden
          />
        )}
      </AbsoluteFill>
    </GradeContext.Provider>
  );
};
