// Act III — Stage (Shots 6–14) · 5700 f total.
//
// ARCHITECTURE DISCIPLINE (per SHOT_SPEC §1.6 + CC_AUDIT):
// - The four Stage Layers (PriceChart, ClaimShell, MoneyOverlay,
//   FourCardGrid) are ALL mounted at Act-local frame 0 with their
//   visibility driven by opacity. They never remount mid-act.
// - Layer swaps go through opacity siblings only — no Sequence, no
//   key changes, no <TransitionSeries>.
// - <Camera> wraps the Stage with scale-only push-in.
// - The shot direction modules (Shot06..Shot14) export ShotDirector
//   configs; this Act resolves the active shot and asks it for the
//   per-frame state.

import { AbsoluteFill, useCurrentFrame } from "remotion";

import type { ClaimDetail } from "@/lib/claim-detail-types";

import { DemoStateProvider } from "../_demo/DemoStateContext";
import { Camera } from "../shots/_shared/Camera";
import {
  DP1_PURCHASE_CHIPS,
  DP5_PRICE_CAPTION,
  DP5_PRICE_HEADER,
  DP5_PRICE_PAID,
  DP5_PRICE_SERIES,
  DP6_BODY_SEED_CHARS,
  DP6_EMAIL_BODY,
  DP6_EMAIL_SUBJECT,
  DP7_EVIDENCE,
  DP8_ASSISTANT,
  DP9_APPROVE,
  DP10_MONEY_OVERLAY,
  DP11_FOUR_TYPES,
  DP12_CHAT,
  DP13_IN_STORE,
  DP14_SELF_SERVICE,
  SONY_CLAIM,
} from "../shots/_shared/data";
import { LightScene } from "../shots/_shared/LightScene";
import { Stage } from "../shots/_shared/Stage";
import { COLOR, SHELL, TYPE, WINDOW } from "../shots/_shared/tokens";
import {
  type Act3FrameState,
  type Act3GridCellId,
  defaultAct3FrameState,
  type ShotDirector,
} from "../shots/_shared/types";

import { SHOT_06 } from "../shots/shot-06-monitor__0036-0044/Shot06";
import { SHOT_07 } from "../shots/shot-07-enter__0044-0049/Shot07";
import { SHOT_08 } from "../shots/shot-08-draft__0049-0059/Shot08";
import { SHOT_09 } from "../shots/shot-09-evidence__0059-0107/Shot09";
import { SHOT_10 } from "../shots/shot-10-assistant__0107-0117/Shot10";
import { SHOT_11 } from "../shots/shot-11-approve__0117-0124/Shot11";
import { SHOT_12 } from "../shots/shot-12-moneyback__0124-0132/Shot12";
import { SHOT_13 } from "../shots/shot-13-fourways-1__0132-0152/Shot13";
import { SHOT_14 } from "../shots/shot-14-fourways-2__0152-0211/Shot14";
import { ClaimShellLayer } from "./layers/ClaimShellLayer";
import { FourCardGridLayer } from "./layers/FourCardGridLayer";
import { MoneyOverlayLayer } from "./layers/MoneyOverlayLayer";
import { PriceChartLayer } from "./layers/PriceChartLayer";

const SHOTS: ShotDirector[] = [
  SHOT_06,
  SHOT_07,
  SHOT_08,
  SHOT_09,
  SHOT_10,
  SHOT_11,
  SHOT_12,
  SHOT_13,
  SHOT_14,
];

function resolveFrameState(actLocalF: number): {
  state: Act3FrameState;
  activeShot: ShotDirector | null;
  shotLocalF: number;
} {
  for (const shot of SHOTS) {
    if (actLocalF >= shot.startF && actLocalF < shot.startF + shot.durationF) {
      const shotLocalF = actLocalF - shot.startF;
      return {
        state: shot.computeFrame(shotLocalF),
        activeShot: shot,
        shotLocalF,
      };
    }
  }
  return {
    state: defaultAct3FrameState(),
    activeShot: null,
    shotLocalF: 0,
  };
}

/**
 * Build the per-frame claim object that drives the REAL
 * ClaimDetailShell. Mutates only the fields that change per shot:
 *   - subject + draft body (Shot 8 typewriter)
 *   - status (Shot 11 awaiting → submitted)
 * Everything else is held to SONY_CLAIM's static values.
 */
function buildPerFrameClaim(state: Act3FrameState): ClaimDetail {
  const baseDraft = SONY_CLAIM.draft_versions[0];
  // BUG-4: clamp body chars to >= DP6_BODY_SEED_CHARS so DraftPane
  // never falls into the "No draft yet" empty-state branch while the
  // header still shows "v1 · AI draft · 4 days ago".
  const bodyChars = Math.max(state.draftBodyChars, DP6_BODY_SEED_CHARS);
  return {
    ...SONY_CLAIM,
    status: state.claimSubmitted ? "submitted" : SONY_CLAIM.status,
    subject: DP6_EMAIL_SUBJECT.slice(0, state.draftSubjectChars),
    draft_versions: [
      {
        ...baseDraft,
        content: DP6_EMAIL_BODY.slice(0, bodyChars),
      },
    ],
  };
}

export const ActIII_Stage: React.FC<{
  /** Optional override for solo-shot debug compositions. */
  forcedActLocalF?: number;
}> = ({ forcedActLocalF }) => {
  const frame = useCurrentFrame();
  const actLocalF = forcedActLocalF ?? frame;
  const { state, activeShot, shotLocalF } = resolveFrameState(actLocalF);
  const perFrameClaim = buildPerFrameClaim(state);

  return (
    <DemoStateProvider value={state}>
      <LightScene>
        <Camera scale={state.cameraScale}>
          <Stage>
            {/* z0 — PriceChart (real chart with overlay reveal) */}
            <Stage.Layer opacity={state.layers.priceChart}>
              <PriceChartLayer
                header={DP5_PRICE_HEADER}
                caption={DP5_PRICE_CAPTION}
                series={DP5_PRICE_SERIES}
                pricePaid={DP5_PRICE_PAID}
                revealProgress={state.chartRevealProgress}
                amberDotsVisible={state.chartAmberDotsVisible}
                refLineOpacity={state.chartRefLineOpacity}
                finalLabelOpacity={state.chartFinalLabelOpacity}
                captionOpacity={state.chartCaptionOpacity}
              />
            </Stage.Layer>

            {/* z1 — REAL ClaimDetailShell (mounted once at Act-local f0) */}
            <Stage.Layer opacity={state.layers.claimShell}>
              <ClaimShellLayer state={state} claim={perFrameClaim} />
            </Stage.Layer>

            {/* z2 — Four-card grid */}
            <Stage.Layer opacity={state.layers.fourCardGrid}>
              <FourCardGridLayer state={state} />
            </Stage.Layer>
          </Stage>
        </Camera>

        {/* BUG-7 (v3 review): MoneyOverlay lifted OUT of Stage so its
          coords live in the 1920×1080 canvas space, not the FIT-
          scaled native 1664×1016 inside Stage. Flex-centered wrapper
          puts the number + sub at true canvas (960, 540). Font sizes
          (132 px MONEY, 52 px sub) render at their true values
          instead of FIT-scaled to 0.92×. Opacity gating still keyed
          on state.layers.moneyOverlay so the layer's visibility is
          unchanged. */}
        <AbsoluteFill
          style={{
            opacity: state.layers.moneyOverlay,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MoneyOverlayLayer state={state} />
        </AbsoluteFill>

        {/* Overlays rendered ABOVE everything, in 1920×1080 canvas space. */}
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          {activeShot?.Overlay && <activeShot.Overlay shotLocalF={shotLocalF} />}
        </AbsoluteFill>

        {/* Globals state references for static analysis — keeps imports
          live so Vite doesn't tree-shake the verbatim data tables. */}
        {false && (
          <span style={{ display: "none" }}>
            {DP1_PURCHASE_CHIPS.length}
            {DP6_EMAIL_BODY.length}
            {DP6_EMAIL_SUBJECT.length}
            {DP7_EVIDENCE.policyClause}
            {DP8_ASSISTANT.reply}
            {DP9_APPROVE.dialogBody}
            {DP10_MONEY_OVERLAY.greenValue}
            {DP11_FOUR_TYPES.headline}
            {DP12_CHAT.body}
            {DP13_IN_STORE.body}
            {DP14_SELF_SERVICE.steps.join("")}
            {COLOR.NAVY}
            {TYPE.SUB.fontSize}
            {SHELL.LEFT_DRAFT_W}
            {WINDOW.FIT}
          </span>
        )}
      </LightScene>
    </DemoStateProvider>
  );
};

// ---- Per-shot debug compositions (one per shot in Act III) -----------
// These render the ActIII_Stage with `forcedActLocalF` mapped so the
// solo shot starts at frame 0 of its own composition.

function makeShotDebug(shot: ShotDirector): React.FC {
  return function ShotDebug() {
    const localF = useCurrentFrame();
    return <ActIII_Stage forcedActLocalF={shot.startF + localF} />;
  };
}

export const Shot06Debug = makeShotDebug(SHOT_06);
export const Shot07Debug = makeShotDebug(SHOT_07);
export const Shot08Debug = makeShotDebug(SHOT_08);
export const Shot09Debug = makeShotDebug(SHOT_09);
export const Shot10Debug = makeShotDebug(SHOT_10);
export const Shot11Debug = makeShotDebug(SHOT_11);
export const Shot12Debug = makeShotDebug(SHOT_12);
export const Shot13Debug = makeShotDebug(SHOT_13);
export const Shot14Debug = makeShotDebug(SHOT_14);

// Reference to satisfy the un-used type import (Act3GridCellId only
// flows through layers/* but importing it here documents the contract).
const _gridIdRef: Act3GridCellId = "email";
export const _gridIdRefExport = _gridIdRef;
