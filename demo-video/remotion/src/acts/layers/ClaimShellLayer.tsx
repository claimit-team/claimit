// ClaimShellLayer — mounts the REAL ClaimDetailShell from apps/web
// driven by a per-frame `claim` prop. The shell's editBuffer effect
// (claim-detail-shell.tsx:157–159) auto-resyncs to the prop content,
// so the Shot 8 typewriter "just works" by changing the claim's
// draft_versions[0].content per frame.
//
// On top of the real shell we layer:
//   - PaneFocusOverlays (Shots 7–10 dim/blur per pane)
//   - MoneyUnderlineOverlay (Shot 8 amber underline on "$50.00")
//   - Approve dialog overlay + cursor (Shot 11 — the real shell's
//     ApproveConfirmDialog is mounted but kept open=false; we layer
//     a faux dialog matching its content on top)
//   - Shot 12 dim wrapper (shell at 0.10 opacity + 10px blur)
//
// Mount-once principle preserved: one shell instance for Shots 7–12.

import { useRef } from "react";

import { ClaimDetailShell } from "@/components/claims/claim-detail-shell";
import type { ClaimDetail } from "@/lib/claim-detail-types";

import { DP9_APPROVE } from "../../shots/_shared/data";
import { COLOR, TYPE, WINDOW } from "../../shots/_shared/tokens";
import type { Act3FrameState } from "../../shots/_shared/types";
import { MoneyUnderlineOverlay } from "./MoneyUnderlineOverlay";
import { PaneFocusOverlays } from "./PaneFocusOverlays";

interface Props {
  state: Act3FrameState;
  /** The per-frame claim built by ActIII_Stage from frame state. */
  claim: ClaimDetail;
}

const noopRefetch = async () => {};
const noopApply = (_: unknown) => {};

export const ClaimShellLayer: React.FC<Props> = ({ state, claim }) => {
  const shellContainerRef = useRef<HTMLDivElement>(null);

  // Shot 12 dim ramp: at full dim, shell is 0.10 opacity + 10 px blur.
  const dim = state.shellDimAmount;
  const dimOpacity = 1 - dim * 0.9; // 1 → 0.10
  const dimBlur = dim * 10;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: dimOpacity,
        filter: dimBlur ? `blur(${dimBlur}px)` : "none",
        willChange: "filter, opacity",
        background: COLOR.N50,
      }}
    >
      {/* Real shell — fixed at native dimensions; the Stage wrapper
          already handles the FIT 0.92 downscale. */}
      <div
        ref={shellContainerRef}
        data-claim-shell="root"
        style={{
          position: "absolute",
          inset: 0,
          // ClaimDetailShell uses h-[calc(100dvh-4rem)] internally —
          // override by forcing our fixed height via a wrapper.
          overflow: "hidden",
        }}
      >
        <style>{`
          [data-claim-shell="root"] > * {
            /* D-3 polish (v3 review): trim 12 px so the shell's bottom
               resize-handle dot stays clipped under the Stage's
               overflow:hidden, instead of peeking out at s44. */
            height: ${WINDOW.NATIVE_H - 12}px !important;
          }
        `}</style>
        <ClaimDetailShell claim={claim} refetch={noopRefetch} applyOptimistic={noopApply} />
      </div>

      {/* Pane dim overlays — Shots 7–10 focus shifts */}
      <PaneFocusOverlays focus={state.focus} fullSharp={state.focus.fullSharp} />

      {/* Shot 8 amber underline on "$50.00" */}
      <MoneyUnderlineOverlay
        opacity={state.draftMoneyUnderlineOpacity}
        containerRef={shellContainerRef}
      />

      {/* Approve dialog (Shot 11) */}
      {state.approveDialogOpacity > 0.001 && (
        <ApproveDialogOverlay opacity={state.approveDialogOpacity} rise={state.approveDialogRise} />
      )}

      {/* Cursor (Shot 11) */}
      {state.showCursor && (
        <Cursor x={state.cursorX} y={state.cursorY} pressed={state.cursorPressed} />
      )}
    </div>
  );
};

// ---------- Approve dialog overlay (Shot 11) ----------
//
// BUG-6 (v3 review): pixel-faithful to the real shadcn AlertDialog
// styling (apps/web/src/components/ui/alert-dialog.tsx + Button
// variant="default"). Geometry truth:
//   • Backdrop: rgba(0,0,0,0.10) + backdrop-blur ~2px (NOT 40% +
//     blur 2px as before).
//   • Card: max-width 384, padding 16, border-radius 14 (rounded-xl),
//     gap-4 (16) between header/footer, ring-1 ring-foreground/10
//     (no box-shadow — just a 1px subtle ring at ~10% black).
//   • Title: 16/500 leading-none.
//   • Description: 14/400 muted-foreground (#6B7280).
//   • Footer: edge-to-edge via -mx-4 -mb-4, bg-muted/50, border-t,
//     rounded-b-xl, p-4, flex justify-end gap-2.
//   • Buttons: h-8 (32 px), px-2.5 (10 px H), rounded-lg (8 px),
//     text-sm font-medium (14/500). Cancel: bg-background +
//     border-border. Confirm: bg-primary (deep navy #131517) +
//     text-primary-foreground (near-white).
//
// We render this INSIDE the FIT-scaled Stage so pixel values here
// are NATIVE shell pixels (which appear at FIT × native on canvas).
// The card sits centered on the native shell at (832, 508).
const ApproveDialogOverlay: React.FC<{ opacity: number; rise: number }> = ({ opacity, rise }) => {
  return (
    <>
      {/* Backdrop — 10% black, 2px backdrop-blur */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.10)",
          opacity,
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />
      {/* Card */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 384,
          background: "#FFFFFF",
          borderRadius: 14,
          // ring-1 ring-foreground/10 — 1px subtle ring, no shadow
          boxShadow: "0 0 0 1px rgba(20,20,20,0.10)",
          transform: `translate(-50%, calc(-50% + ${rise}px))`,
          opacity,
          overflow: "hidden",
        }}
      >
        {/* Body (header + description) — p-4 gap-4 */}
        <div
          style={{
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: TYPE.SUB.fontFamily,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1,
              color: "#101318",
            }}
          >
            {DP9_APPROVE.dialogTitle}
          </div>
          <div
            style={{
              fontFamily: TYPE.SUB.fontFamily,
              fontSize: 14,
              fontWeight: 400,
              lineHeight: 1.5,
              color: "#6B7280", // muted-foreground (oklch 0.556 0 0)
            }}
          >
            {DP9_APPROVE.dialogBody}
          </div>
        </div>
        {/* Footer — edge-to-edge bg-muted/50 + border-t */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: 16,
            background: "rgba(245,245,245,0.5)", // bg-muted/50
            borderTop: "1px solid #E5E5E5", // border-border
          }}
        >
          <DialogButton variant="cancel">{DP9_APPROVE.cancelLabel}</DialogButton>
          <DialogButton variant="confirm">{DP9_APPROVE.sendLabel}</DialogButton>
        </div>
      </div>
    </>
  );
};

const DialogButton: React.FC<{
  variant: "cancel" | "confirm";
  children: React.ReactNode;
}> = ({ variant, children }) => {
  const isConfirm = variant === "confirm";
  return (
    <button
      type="button"
      style={{
        height: 32, // h-8
        padding: "0 10px", // px-2.5
        borderRadius: 8, // rounded-lg
        fontFamily: TYPE.SUB.fontFamily,
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        whiteSpace: "nowrap",
        cursor: "pointer",
        background: isConfirm ? "#131517" : "#FFFFFF", // bg-primary / bg-background
        color: isConfirm ? "#FAFAFA" : "#101318",
        border: isConfirm ? "1px solid transparent" : "1px solid #E5E5E5",
      }}
    >
      {children}
    </button>
  );
};

// ---------- Cursor (Shot 11) ----------
const Cursor: React.FC<{ x: number; y: number; pressed: boolean }> = ({ x, y, pressed }) => (
  <div
    style={{
      position: "absolute",
      left: x - 8,
      top: y - 8,
      width: 16,
      height: 16,
      borderRadius: "50%",
      background: COLOR.NAVY,
      opacity: pressed ? 0.9 : 0.75,
      transform: pressed ? "scale(0.9)" : "scale(1)",
      boxShadow: "0 2px 6px rgba(0,0,0,0.30)",
      pointerEvents: "none",
    }}
  />
);
