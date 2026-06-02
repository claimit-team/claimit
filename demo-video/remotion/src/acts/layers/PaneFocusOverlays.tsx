// PaneFocusOverlays — non-invasive per-pane RackFocus for the real
// ClaimDetailShell.
//
// We can't insert RackFocus *inside* the shell (apps/web is read-only),
// so for each pane (Draft / Evidence / Assistant) that's out-of-focus
// we render an absolutely-positioned `backdrop-filter` rectangle on
// top of that pane's known geometry. The rectangle uses:
//   backdrop-filter: blur(8px) saturate(0.55)
//   background: rgba(255,255,255, 1 - 0.15) when fully dim
// to achieve SHOT_SPEC §1.7's "blur 8px, opacity 0.15, saturate 0.55".
//
// Pane geometries are in NATIVE shell coordinates (1664×1016) — the
// outer 40/60 horizontal split and inner 60/40 vertical split match
// the LAYOUT constants in claim-detail-shell.tsx:51–57. The header
// area (top ~96 px) and resize handles (1 px) are never dimmed.

import { COLOR } from "../../shots/_shared/tokens";

// Header height — approximate (the real ClaimHeader is ~80–100 px
// with buttons; padded to 96 to keep our overlay below it).
const HEADER_H = 96;
// 40/60 outer split of the 1664-px native width.
const DRAFT_W = Math.round(1664 * 0.4); // 666
// inner vertical split (Evidence 60, Assistant 40) of the area
// remaining below the header (1016 - 96 = 920 px).
const PANE_AREA_H = 1016 - HEADER_H; // 920
const EVIDENCE_H = Math.round(PANE_AREA_H * 0.6); // 552
const ASSISTANT_H = PANE_AREA_H - EVIDENCE_H; // 368

const PANES = {
  draft: {
    left: 0,
    top: HEADER_H,
    width: DRAFT_W,
    height: PANE_AREA_H,
  },
  evidence: {
    left: DRAFT_W,
    top: HEADER_H,
    width: 1664 - DRAFT_W,
    height: EVIDENCE_H,
  },
  assistant: {
    left: DRAFT_W,
    top: HEADER_H + EVIDENCE_H,
    width: 1664 - DRAFT_W,
    height: ASSISTANT_H,
  },
} as const;

interface Props {
  /** Focus value 0..1 for each pane (1 = sharp / overlay invisible). */
  focus: { draft: number; evidence: number; assistant: number };
  /** When true, all panes sharp (no overlay rendered). */
  fullSharp: boolean;
}

/**
 * Render dim overlays for each pane whose focus < 1. Each overlay is
 * GPU-composited via backdrop-filter so the underlying shell DOM is
 * never modified or remounted.
 *
 * The visual mapping:
 *   focus = 1.0 → overlay invisible (opacity 0)
 *   focus = 0.0 → overlay fully dim (opacity 0.85, blur 8px, sat 0.55)
 * Linear interpolation between. Bezier ramping happens at the caller
 * level (Act III computes focus from EASE_UI).
 */
export const PaneFocusOverlays: React.FC<Props> = ({ focus, fullSharp }) => {
  if (fullSharp) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <PaneDim rect={PANES.draft} focus={focus.draft} />
      <PaneDim rect={PANES.evidence} focus={focus.evidence} />
      <PaneDim rect={PANES.assistant} focus={focus.assistant} />
    </div>
  );
};

const PaneDim: React.FC<{
  rect: { left: number; top: number; width: number; height: number };
  focus: number;
}> = ({ rect, focus }) => {
  // Avoid rendering completely sharp panes (saves the GPU layer).
  if (focus > 0.99) return null;

  // At focus=0 we want a strong dim: blur(8) saturate(0.55) and the
  // backdrop is tinted to ~85% white so the pane reads as ~15% bright.
  const dimT = 1 - focus; // 0..1, larger = more dim
  const blurPx = (8 * dimT).toFixed(2);
  const sat = (0.55 + 0.45 * focus).toFixed(2);
  const tintAlpha = 0.85 * dimT;

  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        background: `rgba(${parseInt(COLOR.N50.slice(1, 3), 16)}, ${parseInt(COLOR.N50.slice(3, 5), 16)}, ${parseInt(COLOR.N50.slice(5, 7), 16)}, ${tintAlpha})`,
        backdropFilter: `blur(${blurPx}px) saturate(${sat})`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(${sat})`,
        willChange: "backdrop-filter, background",
      }}
    />
  );
};

export const PANE_GEOMETRY = PANES;
