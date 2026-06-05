// Shared "component reveal" primitive for the ARCH section + techstack beat.
// CONTRACT: an element's image + text reveal TOGETHER (same start frame, settle
// together) — never text-before-icon. One spring (damping 14, mass 0.5, 18f) is
// used everywhere (ArchFlow nodes via `useReveal`, b09b techstack via
// `RevealCard`) so b05-b09 + b09b share one Apple-grade tempo.
import { Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { colors, FONT_STACK_TEXT } from "./tokens";

/** Spring-driven reveal progress (0→1, clamped) + derived opacity/scale/translateY. */
export function useReveal(fromFrame: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = Math.min(
    1,
    Math.max(
      0,
      spring({
        frame: frame - fromFrame,
        fps,
        config: { damping: 14, mass: 0.5 },
        durationInFrames: 18,
      }),
    ),
  );
  return { progress: p, opacity: p, scale: 0.95 + 0.05 * p, translateY: (1 - p) * 10 };
}

/** Techstack card: logo + name + 1-line description, all revealing together. */
export const RevealCard: React.FC<{
  /** brandlogos filename INCLUDING extension, e.g. "mongodb.svg" / "phoenix.png". */
  logo: string;
  name: string;
  description: string;
  fromFrame: number;
  width?: number;
}> = ({ logo, name, description, fromFrame, width = 420 }) => {
  const r = useReveal(fromFrame);
  return (
    <div
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 12,
        fontFamily: FONT_STACK_TEXT,
        opacity: r.opacity,
        transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
      }}
    >
      <Img
        src={staticFile(`brandlogos/${logo}`)}
        style={{ height: 56, maxWidth: 130, objectFit: "contain" }}
      />
      <div
        style={{ fontSize: 24, fontWeight: 700, color: colors.text.dark, letterSpacing: "-0.01em" }}
      >
        {name}
      </div>
      <div style={{ fontSize: 16, color: colors.text.muted, lineHeight: 1.35 }}>{description}</div>
    </div>
  );
};
