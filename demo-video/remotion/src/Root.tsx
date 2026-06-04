import "./load-fonts";
import "./globals.css";

import { Composition } from "remotion";

import { Beat01 } from "./beats/b01_hook-cracks__000-005/Beat01";
// b02-b04 (old HOOK beats) replaced 2026-06-04 by peer-scene wrappers — imported below.
import { Beat02 } from "./beats/b02_peer-hook/Beat02";
import { Beat03 } from "./beats/b03_peer-gap/Beat03";
import { Beat04 } from "./beats/b04_peer-meet/Beat04";
import { Beat05 } from "./beats/b05_arch-master/Beat05";
import { Beat06 } from "./beats/b06_demo-upload-extract/Beat06";
import { Beat07 } from "./beats/b07_demo-monitor-drop/Beat07";
import { Beat10 } from "./beats/b10_refund-receipt-intro__050-055/Beat10";
import { Beat11 } from "./beats/b11_refund-upload__055-060/Beat11";
import { Beat12 } from "./beats/b12_refund-extract__100-105/Beat12";
import { Beat13 } from "./beats/b13_refund-fields__105-110/Beat13";
import { Beat14 } from "./beats/b14_refund-confirm__110-115/Beat14";
import { Beat15 } from "./beats/b15_refund-watch__115-120/Beat15";
import { Beat16 } from "./beats/b16_refund-timepass__120-125/Beat16";
import { Beat17 } from "./beats/b17_refund-detect__125-130/Beat17";
import { Beat18 } from "./beats/b18_refund-policy__130-135/Beat18";
import { Beat19 } from "./beats/b19_refund-draft__135-140/Beat19";
import { Beat20 } from "./beats/b20_refund-rewrite-ask__140-145/Beat20";
import { Beat21 } from "./beats/b21_refund-rewrite-result__145-150/Beat21";
import { Beat22 } from "./beats/b22_refund-edit__150-155/Beat22";
import { Beat23 } from "./beats/b23_refund-saved__155-200/Beat23";
import { Beat24 } from "./beats/b24_refund-review__200-205/Beat24";
import { Beat25 } from "./beats/b25_refund-approve__205-210/Beat25";
import { Beat26 } from "./beats/b26_refund-sent__210-215/Beat26";
import { Beat27 } from "./beats/b27_refund-bridge__215-220/Beat27";
import { Beat28 } from "./beats/b28_cred-grid__220-226/Beat28";
import { Beat29 } from "./beats/b29_cred-channels__226-232/Beat29";
import { Beat35 } from "./beats/b35_payoff-final__252-300/Beat35";
import {
  UiAppShellEmpty,
  UiClaimshellApprovedState,
  UiClaimshellAssistantActive,
  UiClaimshellLoaded,
  UiClaimsList,
  UiDashboardLoaded,
  UiOcrFieldsPopulated,
  UiPurchaseDetailWithChart,
  UiSentConfirmation,
  UiUploadModalOnDashboard,
} from "./uirefs";
// ===== PEER — NewVideo + 9 Scenes (for audit preview) =====
import { NewVideo } from "./new-video/NewVideo";
import {
  NEW_VIDEO_DURATION_F,
  S1_HOOK_F,
  S2_GAP_F,
  S3_MEET_F,
  S4_INGEST_F,
  S5_DROP_F,
  S6_DEMO_F,
  S7_PLATFORMS_F,
  S8_REACH_F,
  S9_CLOSE_F,
} from "./new-video/durations";
import { Scene01Hook } from "./new-video/scenes/Scene01Hook";
import { Scene02Gap } from "./new-video/scenes/Scene02Gap";
import { Scene03Meet } from "./new-video/scenes/Scene03Meet";
import { Scene04Ingest } from "./new-video/scenes/Scene04Ingest";
import { Scene05Drop } from "./new-video/scenes/Scene05Drop";
import { Scene06DemoCore } from "./new-video/scenes/Scene06DemoCore";
import { Scene07Platforms } from "./new-video/scenes/Scene07Platforms";
import { Scene08Reach } from "./new-video/scenes/Scene08Reach";
import { Scene09Close } from "./new-video/scenes/Scene09Close";

// ============================================================================
// BATCH 0 LEGACY — Erdun's 18-shot structure, archived 2026-06-03.
//
// Original Root.tsx (Shot01–Shot18 + ClaimItFilm Composition registrations)
// preserved in git history: `git log -- src/Root.tsx`.
// Shot sources moved to src/_archive/erdun_shots_v1/.
// To restore an individual shot in a future batch: copy its folder back
// from the archive and re-add the import + <Composition> line below.
//
// The lines that were here (commented out, not deleted, per instructions):
//
//   import { Composition } from "remotion";
//   import {
//     Shot06Debug, Shot07Debug, Shot08Debug, Shot09Debug,
//     Shot10Debug, Shot11Debug, Shot12Debug, Shot13Debug, Shot14Debug,
//   } from "./_archive/erdun_shots_v1/acts/ActIII_Stage";
//   import { SHOT_01_DURATION_F, … SHOT_18_DURATION_F }
//     from "./_archive/erdun_shots_v1/shots/_shared/durations";
//   import { Shot01 } from "./_archive/erdun_shots_v1/shots/shot-01-coldopen__0000-0003/Shot01";
//   import { Shot02 } from "./_archive/erdun_shots_v1/shots/shot-02-things__0003-0012/Shot02";
//   import { Shot03 } from "./_archive/erdun_shots_v1/shots/shot-03-gap__0012-0018/Shot03";
//   import { Shot04 } from "./_archive/erdun_shots_v1/shots/shot-04-light-logo__0018-0028/Shot04";
//   import { Shot05 } from "./_archive/erdun_shots_v1/shots/shot-05-whatitis__0028-0036/Shot05";
//   import { Shot15 } from "./_archive/erdun_shots_v1/shots/shot-15-boundary__0211-0230/Shot15";
//   import { Shot16 } from "./_archive/erdun_shots_v1/shots/shot-16-seed__0230-0241/Shot16";
//   import { Shot17 } from "./_archive/erdun_shots_v1/shots/shot-17-tagline__0241-0252/Shot17";
//   import { Shot17b } from "./_archive/erdun_shots_v1/shots/shot-17b-techstack__0247-0254/Shot17b";
//   import { Shot18 } from "./_archive/erdun_shots_v1/shots/shot-18-signoff__0252-0300/Shot18";
//   import { TIMELINE_DURATION_FRAMES, Timeline }
//     from "./_archive/erdun_shots_v1/Timeline";
//
//   <Composition id="ClaimItFilm" component={Timeline}
//     durationInFrames={TIMELINE_DURATION_FRAMES} fps={60} width={1920} height={1080} />
//   <Composition id="Shot01" component={Shot01} durationInFrames={180}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot02" component={Shot02} durationInFrames={540}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot03" component={Shot03} durationInFrames={360}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot04" component={Shot04} durationInFrames={600}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot05" component={Shot05} durationInFrames={480}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot06" component={Shot06Debug} durationInFrames={480}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot07" component={Shot07Debug} durationInFrames={300}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot08" component={Shot08Debug} durationInFrames={600}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot09" component={Shot09Debug} durationInFrames={480}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot10" component={Shot10Debug} durationInFrames={600}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot11" component={Shot11Debug} durationInFrames={420}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot12" component={Shot12Debug} durationInFrames={480}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot13" component={Shot13Debug} durationInFrames={1200} fps={60} width={1920} height={1080} />
//   <Composition id="Shot14" component={Shot14Debug} durationInFrames={1140} fps={60} width={1920} height={1080} />
//   <Composition id="Shot15" component={Shot15}      durationInFrames={1140} fps={60} width={1920} height={1080} />
//   <Composition id="Shot16" component={Shot16}      durationInFrames={660}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot17" component={Shot17}      durationInFrames={360}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot17b" component={Shot17b}    durationInFrames={420}  fps={60} width={1920} height={1080} />
//   <Composition id="Shot18" component={Shot18}      durationInFrames={360}  fps={60} width={1920} height={1080} />
// ============================================================================

export const RemotionRoot = () => {
  return (
    <>
      {/* BATCH C — HOOK. Beat01 = CC original (retimed 240f). b02-b04 replaced
          2026-06-04 by wrappers around peer scenes (Scene01Hook/02Gap/03Meet). */}
      <Composition
        id="Beat01"
        component={Beat01}
        durationInFrames={240}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition id="Beat02" component={Beat02} durationInFrames={600} fps={60} width={1920} height={1080} />
      <Composition id="Beat03" component={Beat03} durationInFrames={540} fps={60} width={1920} height={1080} />
      <Composition id="Beat04" component={Beat04} durationInFrames={300} fps={60} width={1920} height={1080} />
      {/* BATCH D — ARCH (single narrative beat b05; merged b06-b09+b09b 2026-06-04). */}
      <Composition id="Beat05" component={Beat05} durationInFrames={2280} fps={60} width={1920} height={1080} />
      {/* DEMO — new b06 (upload → OCR extract); will consolidate b10-b14 pending review. */}
      <Composition id="Beat06" component={Beat06} durationInFrames={960} fps={60} width={1920} height={1080} />
      {/* DEMO — new b07 (monitor → drop detect); will consolidate b15-b17 pending review. */}
      <Composition id="Beat07" component={Beat07} durationInFrames={780} fps={60} width={1920} height={1080} />
      {/* BATCH E — REFUND DEMO (beats 10-27). */}
      <Composition id="Beat10" component={Beat10} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat11" component={Beat11} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat12" component={Beat12} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat13" component={Beat13} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat14" component={Beat14} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat15" component={Beat15} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat16" component={Beat16} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat17" component={Beat17} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat18" component={Beat18} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat19" component={Beat19} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat20" component={Beat20} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat21" component={Beat21} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat22" component={Beat22} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat23" component={Beat23} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat24" component={Beat24} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat25" component={Beat25} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat26" component={Beat26} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat27" component={Beat27} durationInFrames={300} fps={60} width={1920} height={1080} />
      {/* BATCH F — CREDIBILITY (28-29). */}
      <Composition id="Beat28" component={Beat28} durationInFrames={300} fps={60} width={1920} height={1080} />
      <Composition id="Beat29" component={Beat29} durationInFrames={300} fps={60} width={1920} height={1080} />
      {/* BATCH G — IMPLEMENTATION PROOF (30-34) — REMOVED 2026-06-03 (DEMO_INTERACTION_SPEC_v1 Phase 1). */}
      {/* BATCH H — PAYOFF (35) — 480f. */}
      <Composition id="Beat35" component={Beat35} durationInFrames={480} fps={60} width={1920} height={1080} />
      {/* ====================================================================== */}
      {/* UI — apps/web visual reference stills (UI_INTEGRATION_AUDIT_v2).        */}
      {/* Static replicas of production surfaces; rendered at frame 0 to          */}
      {/* out/uirefs/. Not part of the film timeline.                            */}
      {/* ====================================================================== */}
      <Composition id="ui-app-shell-empty" component={UiAppShellEmpty} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-dashboard-loaded" component={UiDashboardLoaded} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-claims-list" component={UiClaimsList} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-claimshell-loaded" component={UiClaimshellLoaded} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-claimshell-assistant-active" component={UiClaimshellAssistantActive} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-claimshell-approved-state" component={UiClaimshellApprovedState} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-upload-modal-on-dashboard" component={UiUploadModalOnDashboard} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-ocr-fields-populated" component={UiOcrFieldsPopulated} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-purchase-detail-with-chart" component={UiPurchaseDetailWithChart} durationInFrames={60} fps={60} width={1920} height={1080} />
      <Composition id="ui-sent-confirmation" component={UiSentConfirmation} durationInFrames={60} fps={60} width={1920} height={1080} />
      {/* ====================================================================== */}
      {/* PEER — NewVideo + 9 Scenes (for audit preview).                        */}
      {/* Pulled from origin/dev (no merge); shots/_shared restored from archive */}
      {/* (COPY) so peer's Erdun-design-system imports resolve. Each Scene also  */}
      {/* registered standalone for side-by-side preview vs CC's beats.          */}
      {/* ====================================================================== */}
      <Composition id="NewVideo" component={NewVideo} durationInFrames={NEW_VIDEO_DURATION_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-01-hook" component={Scene01Hook} durationInFrames={S1_HOOK_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-02-gap" component={Scene02Gap} durationInFrames={S2_GAP_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-03-meet" component={Scene03Meet} durationInFrames={S3_MEET_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-04-ingest" component={Scene04Ingest} durationInFrames={S4_INGEST_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-05-drop" component={Scene05Drop} durationInFrames={S5_DROP_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-06-democore" component={Scene06DemoCore} durationInFrames={S6_DEMO_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-07-platforms" component={Scene07Platforms} durationInFrames={S7_PLATFORMS_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-08-reach" component={Scene08Reach} durationInFrames={S8_REACH_F} fps={60} width={1920} height={1080} />
      <Composition id="peer-scene-09-close" component={Scene09Close} durationInFrames={S9_CLOSE_F} fps={60} width={1920} height={1080} />
    </>
  );
};
