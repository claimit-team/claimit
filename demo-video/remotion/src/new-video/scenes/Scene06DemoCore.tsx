// Scene 6 — Demo core · 1:14–2:06 · 3120f · light.
// The fidelity centerpiece. Mounts the REAL ClaimDetailShell ONCE and
// drives it with a per-frame Act3FrameState (same contract Act III uses)
// so we reuse the real draft / evidence / assistant panes + the money
// overlay. Beats:
//   local 0–1800   Workspace: draft typewriter → evidence → assistant + trace
//   local 1800–3120 Approve flow → money payoff (−$50 amber → +$50 green)

import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";

import type { ClaimDetail } from "@/lib/claim-detail-types";
import { DemoStateProvider } from "../../_demo/DemoStateContext";
import { ClaimShellLayer } from "../../acts/layers/ClaimShellLayer";
import { MoneyOverlayLayer } from "../../acts/layers/MoneyOverlayLayer";
import { Camera } from "../../shots/_shared/Camera";
import {
  DP6_BODY_SEED_CHARS,
  DP6_EMAIL_BODY,
  DP6_EMAIL_SUBJECT,
  DP8_ASSISTANT,
  SONY_CLAIM,
} from "../../shots/_shared/data";
import { LightScene } from "../../shots/_shared/LightScene";
import { Stage } from "../../shots/_shared/Stage";
import { EASE_UI } from "../../shots/_shared/tokens";
import { type Act3FrameState, defaultAct3FrameState } from "../../shots/_shared/types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

const BODY_LEN = DP6_EMAIL_BODY.length;
const SUBJECT_LEN = DP6_EMAIL_SUBJECT.length;
const REPLY_LEN = DP8_ASSISTANT.reply.length;

function buildPerFrameClaim(s: Act3FrameState): ClaimDetail {
  const baseDraft = SONY_CLAIM.draft_versions[0];
  const bodyChars = Math.max(s.draftBodyChars, DP6_BODY_SEED_CHARS);
  return {
    ...SONY_CLAIM,
    status: s.claimSubmitted ? "submitted" : SONY_CLAIM.status,
    subject: DP6_EMAIL_SUBJECT.slice(0, s.draftSubjectChars),
    draft_versions: [{ ...baseDraft, content: DP6_EMAIL_BODY.slice(0, bodyChars) }],
    // Real evidence screenshot (the SONY_CLAIM default path doesn't exist
    // in the bundle — point at the price-proof asset we ship for the film).
    evidence: {
      ...SONY_CLAIM.evidence,
      screenshot_url: staticFile("demo/best-buy-sony-screenshot.svg"),
    },
  };
}

function computeState(f: number): Act3FrameState {
  const s = defaultAct3FrameState();

  // Shell visible the whole scene (fades in at the top).
  s.layers.claimShell = iv(f, [0, 80], [0, 1]);
  s.cameraScale = iv(f, [0, 120, 1800, 1880, 2220, 2340], [1.0, 1.03, 1.03, 1.0, 1.0, 1.04]);

  const WORKSPACE = f < 1800;
  if (WORKSPACE) {
    // Subject + body typewriter (draft beat).
    s.draftSubjectChars = Math.round(iv(f, [110, 180], [0, SUBJECT_LEN]));
    s.draftBodyChars = Math.round(iv(f, [160, 560], [DP6_BODY_SEED_CHARS, BODY_LEN]));
    s.draftMoneyUnderlineOpacity = iv(f, [560, 600, 660, 700], [0, 1, 1, 0]);

    // Per-pane focus walk: draft → evidence → assistant.
    s.focus.fullSharp = false;
    if (f < 620) {
      s.focus = { draft: 1, evidence: 0.15, assistant: 0.0, fullSharp: false };
    } else if (f < 1080) {
      const t = iv(f, [620, 660], [0, 1]);
      s.focus = {
        draft: 1 - 0.85 * t,
        evidence: 0.15 + 0.85 * t,
        assistant: 0.0,
        fullSharp: false,
      };
    } else if (f < 1740) {
      const t = iv(f, [1080, 1120], [0, 1]);
      s.focus = { draft: 0.15, evidence: 1 - 0.85 * t, assistant: t, fullSharp: false };
    } else {
      const t = iv(f, [1740, 1800], [0, 1]);
      s.focus = {
        draft: 0.15 + 0.85 * t,
        evidence: 0.15 + 0.85 * t,
        assistant: 1,
        fullSharp: false,
      };
    }

    // Assistant stream (during the assistant beat).
    s.assistantUserBubbleOpacity = iv(f, [1140, 1180], [0, 1]);
    s.assistantReplyChars = Math.round(iv(f, [1200, 1560], [0, REPLY_LEN]));
    s.assistantStreaming = f >= 1200 && f < 1560;
    s.assistantToolLineOpacity = iv(f, [1560, 1620], [0, 1]);
    return s;
  }

  // ── Approve / money phase (local 1800–3120) ──────────────────────
  s.focus.fullSharp = true;
  // Keep the draft fully typed + assistant content present underneath.
  s.draftSubjectChars = SUBJECT_LEN;
  s.draftBodyChars = BODY_LEN;
  s.assistantReplyChars = REPLY_LEN;
  s.assistantToolLineOpacity = 1;
  s.assistantStreaming = false;

  // Cursor → approve button → dialog → send.
  s.showCursor = f >= 1820 && f < 2160;
  s.cursorX = iv(f, [1820, 1900, 1980, 2040], [1480, 1480, 980, 952]);
  s.cursorY = iv(f, [1820, 1900, 1980, 2040], [420, 70, 70, 600]);
  s.cursorPressed = (f >= 1900 && f < 1920) || (f >= 2040 && f < 2060);
  s.approveButtonHover = f >= 1880 && f < 1920;

  s.approveDialogOpacity = iv(f, [1920, 1960, 2060, 2100], [0, 1, 1, 0]);
  s.approveDialogRise = iv(f, [1920, 1960], [12, 0]);

  s.claimSubmitted = f >= 2060;
  s.approveBannerOpacity = iv(f, [2080, 2140], [0, 1]);

  // Money payoff.
  s.shellDimAmount = iv(f, [2200, 2300], [0, 1]);
  s.layers.moneyOverlay = iv(f, [2260, 2320], [0, 1]);
  s.moneyMinusOpacity = iv(f, [2420, 2460], [1, 0]);
  s.moneyGreenT = iv(f, [2420, 2480], [0, 1]);
  s.moneyScale = iv(f, [2400, 2480, 2560], [1, 1.06, 1.0]);
  s.moneyBloomIntensity = iv(f, [2420, 2500, 2700, 3120], [0, 0.9, 0.5, 0.4]);
  s.moneySubOpacity = iv(f, [2500, 2560], [0, 1]);
  s.moneySubY = iv(f, [2500, 2560], [14, 0]);

  return s;
}

export const Scene06DemoCore: React.FC = () => {
  const frame = useCurrentFrame();
  const state = computeState(frame);
  const claim = buildPerFrameClaim(state);

  return (
    <DemoStateProvider value={state}>
      <LightScene>
        <Camera scale={state.cameraScale}>
          <Stage>
            <Stage.Layer opacity={state.layers.claimShell}>
              <ClaimShellLayer state={state} claim={claim} />
            </Stage.Layer>
          </Stage>
        </Camera>

        {/* Money overlay — canvas space, true font size (mirrors Act III). */}
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
      </LightScene>
    </DemoStateProvider>
  );
};
