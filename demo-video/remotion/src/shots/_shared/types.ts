// Shared types for Act III's direction-config pattern.
// Each Act-III shot (6–14) exports a ShotDirector consumed by
// ActIII_Stage. The shot files do NOT mount the shell themselves;
// they just compute a per-frame state object that ActIII drives the
// once-mounted layers with.

import type { CSSProperties, ReactNode } from "react";

export type Act3GridCellId =
  | "email"
  | "chat_script"
  | "in_store_guide"
  | "self_service_walkthrough";

export interface StageLayerOpacity {
  /** Real PriceHistoryChart layer */
  priceChart: number;
  /** Real ClaimDetailShell layer */
  claimShell: number;
  /** Hero money overlay (Shot 12) */
  moneyOverlay: number;
  /** Four-card grid layer (Shots 13–14) */
  fourCardGrid: number;
}

export interface FocusState {
  /** Focus value for the Draft pane (1 = sharp, 0 = dim). */
  draft: number;
  evidence: number;
  assistant: number;
  /** Convenience: when true, the whole shell is sharp (overrides per-pane). */
  fullSharp: boolean;
}

export interface Act3FrameState {
  layers: StageLayerOpacity;
  focus: FocusState;
  cameraScale: number;

  // ── Shot 6: PriceHistoryChart entrance ───────────────────────────
  chartRevealProgress: number;
  chartAmberDotsVisible: number;
  chartFinalLabelOpacity: number;
  chartCaptionOpacity: number;
  chartRefLineOpacity: number;

  // ── Shot 8: DraftPane typewriter ────────────────────────────────
  draftSubjectChars: number;
  draftBodyChars: number;
  draftMoneyUnderlineOpacity: number;

  // ── Shot 10: AssistantPane stream ───────────────────────────────
  assistantUserBubbleOpacity: number;
  assistantReplyChars: number;
  assistantToolLineOpacity: number;
  assistantStreaming: boolean;

  // ── Shot 11: Approve flow ────────────────────────────────────────
  showCursor: boolean;
  cursorX: number;
  cursorY: number;
  cursorPressed: boolean;
  /** Render a real arrow pointer (true) vs the legacy dot (false). */
  cursorArrow: boolean;
  /** 0→1 click ripple progress; drives the expanding ring on press. */
  cursorClickPulse: number;
  approveDialogOpacity: number;
  approveDialogRise: number;
  approveButtonHover: boolean;
  claimSubmitted: boolean;
  approveBannerOpacity: number;

  // ── Shot 12: Money overlay ───────────────────────────────────────
  shellDimAmount: number;
  moneyMinusOpacity: number;
  moneyGreenT: number;
  moneyScale: number;
  moneyBloomIntensity: number;
  moneySubOpacity: number;
  moneySubY: number;

  // ── Shots 13/14: Four-card grid ──────────────────────────────────
  gridTopLabelOpacity: number;
  gridTopLabelY: number;
  gridCellOpacity: Record<Act3GridCellId, number>;
  gridCellSharp: Record<Act3GridCellId, number>;
  gridCellFooterOpacity: Record<Act3GridCellId, number>;
  gridClosingOpacity: number;
  emailHeroOpacity: number;
}

export function defaultAct3FrameState(): Act3FrameState {
  const zeroGrid: Record<Act3GridCellId, number> = {
    email: 0,
    chat_script: 0,
    in_store_guide: 0,
    self_service_walkthrough: 0,
  };
  return {
    layers: {
      priceChart: 0,
      claimShell: 0,
      moneyOverlay: 0,
      fourCardGrid: 0,
    },
    focus: { draft: 1, evidence: 1, assistant: 1, fullSharp: true },
    cameraScale: 1,
    chartRevealProgress: 0,
    chartAmberDotsVisible: 0,
    chartFinalLabelOpacity: 0,
    chartCaptionOpacity: 0,
    chartRefLineOpacity: 0,
    draftSubjectChars: 0,
    draftBodyChars: 0,
    draftMoneyUnderlineOpacity: 0,
    assistantUserBubbleOpacity: 0,
    assistantReplyChars: 0,
    assistantToolLineOpacity: 0,
    assistantStreaming: false,
    showCursor: false,
    cursorX: 1600,
    cursorY: 200,
    cursorPressed: false,
    cursorArrow: false,
    cursorClickPulse: 0,
    approveDialogOpacity: 0,
    approveDialogRise: 12,
    approveButtonHover: false,
    claimSubmitted: false,
    approveBannerOpacity: 0,
    shellDimAmount: 0,
    moneyMinusOpacity: 1,
    moneyGreenT: 0,
    moneyScale: 1,
    moneyBloomIntensity: 0,
    moneySubOpacity: 0,
    moneySubY: 14,
    gridTopLabelOpacity: 0,
    gridTopLabelY: 16,
    gridCellOpacity: { ...zeroGrid },
    gridCellSharp: { ...zeroGrid },
    gridCellFooterOpacity: { ...zeroGrid },
    gridClosingOpacity: 0,
    emailHeroOpacity: 0,
  };
}

export interface ShotDirector {
  id: string;
  /** Act-local frame this shot begins. */
  startF: number;
  durationF: number;
  /** Compute the Act III state at the SHOT-local frame (0..durationF-1). */
  computeFrame: (shotLocalF: number) => Act3FrameState;
  /** Optional overlay JSX rendered above the stage. shotLocalF is the SHOT-local frame. */
  Overlay?: React.FC<{ shotLocalF: number }>;
}

export type { CSSProperties, ReactNode };
