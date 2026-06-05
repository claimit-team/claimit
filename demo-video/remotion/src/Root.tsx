import "./load-fonts";
import "./globals.css";

import { Composition } from "remotion";

import { Beat01 } from "./beats/b01_hook-cracks__000-005/Beat01";
// b02-b04 (old HOOK beats) replaced 2026-06-04 by peer-scene wrappers — imported below.
import { Beat02 } from "./beats/b02_peer-hook/Beat02";
import { Beat03 } from "./beats/b03_peer-gap/Beat03";
import { Beat04 } from "./beats/b04_peer-meet/Beat04";
import { Beat05 } from "./beats/b05_arch-master/Beat05";
import { Beat05New } from "./beats/b05new_arch-rolling/Beat05New";
import { Beat05New2 } from "./beats/b05new2_arch-sponsors/Beat05New2";
import { Beat05New3 } from "./beats/b05new3_arch-synced/Beat05New3";
import { Beat05New4 } from "./beats/b05new4_arch-spoken/Beat05New4";
import { Beat06 } from "./beats/b06_demo-upload-extract/Beat06";
import { Beat07 } from "./beats/b07_demo-monitor-drop/Beat07";
import { Beat08 } from "./beats/b08_demo-3panel-claimshell/Beat08";
import { Beat09 } from "./beats/b09_demo-reach-policies/Beat09";
import { Beat10 } from "./beats/b10_payoff-claimit/Beat10";
// LEGACY b10-b29 imports removed — superseded by b06-b09 (DEMO consolidation 2026-06-04).
import { Beat35 } from "./beats/b35_payoff-final__252-300/Beat35";
import { MasterDemo } from "./master/MasterDemo";
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
  S9_SPONSORS_F,
  S10_CLOSE_F,
} from "./new-video/durations";
// ===== PEER — NewVideo + 9 Scenes (for audit preview) =====
import { NewVideo } from "./new-video/NewVideo";
import { Scene01Hook } from "./new-video/scenes/Scene01Hook";
import { Scene02Gap } from "./new-video/scenes/Scene02Gap";
import { Scene03Meet } from "./new-video/scenes/Scene03Meet";
import { Scene04Ingest } from "./new-video/scenes/Scene04Ingest";
import { Scene05Drop } from "./new-video/scenes/Scene05Drop";
import { Scene06DemoCore } from "./new-video/scenes/Scene06DemoCore";
import { Scene07Platforms } from "./new-video/scenes/Scene07Platforms";
import { Scene08Reach } from "./new-video/scenes/Scene08Reach";
import { Scene09Sponsors } from "./new-video/scenes/Scene09Sponsors";
import { Scene10Close } from "./new-video/scenes/Scene10Close";
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
      <Composition
        id="Beat02"
        component={Beat02}
        durationInFrames={600}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Beat03"
        component={Beat03}
        durationInFrames={540}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Beat04"
        component={Beat04}
        durationInFrames={300}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* BATCH D — ARCH (single narrative beat b05; merged b06-b09+b09b 2026-06-04). */}
      <Composition
        id="Beat05"
        component={Beat05}
        durationInFrames={2280}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* ARCH variant — b05new: rolling-pan camera + agent badges + MCP/Phoenix/ES
          connection lines layered ON TOP of the full b05 pipeline (both kept for review). */}
      <Composition
        id="Beat05New"
        component={Beat05New}
        durationInFrames={2520}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* ARCH variant — b05new2: synchronized MCP reveal (all 4 agents first) +
          peer sponsors fork + scrolling techstack. All 3 ARCH variants kept. */}
      <Composition
        id="Beat05New2"
        component={Beat05New2}
        durationInFrames={3240}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* ARCH variant — b05new3: one-at-a-time MCP reveal (card+node+lines synced)
          + arch-fade / cards-rise / techstack endgame. All 4 ARCH variants kept. */}
      <Composition
        id="Beat05New3"
        component={Beat05New3}
        durationInFrames={3380}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* ARCH variant — b05new4: production cut, accelerated to ~49s + "The System
          Behind It" title + 13 VO-aligned spoken subtitles. All 5 variants kept. */}
      <Composition
        id="Beat05New4"
        component={Beat05New4}
        durationInFrames={2940}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* DEMO — new b06 (upload → OCR extract); will consolidate b10-b14 pending review. */}
      <Composition
        id="Beat06"
        component={Beat06}
        durationInFrames={960}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* DEMO — new b07 (monitor → drop detect); will consolidate b15-b17 pending review. */}
      <Composition
        id="Beat07"
        component={Beat07}
        durationInFrames={760}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* DEMO — new b08 (3-panel ClaimShell + chat→redraft); will consolidate b19-b26 pending review. */}
      <Composition
        id="Beat08"
        component={Beat08}
        durationInFrames={1150}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* DEMO — new b09 (26-retailer reach + 4 platform policies). */}
      <Composition
        id="Beat09"
        component={Beat09}
        durationInFrames={880}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* PAYOFF — new b10 closing ClaimIt lockup (peer Scene09Close base). b35 kept for comparison. */}
      <Composition
        id="Beat10"
        component={Beat10}
        durationInFrames={560}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* =================================================================== */}
      {/* LEGACY b10-b29: superseded by b06-b09 (DEMO consolidation 2026-06-04). */}
      {/* Folder files preserved under src/beats/_legacy_bNN_ folders. Not registered. */}
      {/* =================================================================== */}
      {/* BATCH G — IMPLEMENTATION PROOF (30-34) — REMOVED 2026-06-03 (DEMO_INTERACTION_SPEC_v1 Phase 1). */}
      {/* BATCH H — PAYOFF (35) — 480f. */}
      <Composition
        id="Beat35"
        component={Beat35}
        durationInFrames={480}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* ====================================================================== */}
      {/* UI — apps/web visual reference stills (UI_INTEGRATION_AUDIT_v2).        */}
      {/* Static replicas of production surfaces; rendered at frame 0 to          */}
      {/* out/uirefs/. Not part of the film timeline.                            */}
      {/* ====================================================================== */}
      <Composition
        id="ui-app-shell-empty"
        component={UiAppShellEmpty}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-dashboard-loaded"
        component={UiDashboardLoaded}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-claims-list"
        component={UiClaimsList}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-claimshell-loaded"
        component={UiClaimshellLoaded}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-claimshell-assistant-active"
        component={UiClaimshellAssistantActive}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-claimshell-approved-state"
        component={UiClaimshellApprovedState}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-upload-modal-on-dashboard"
        component={UiUploadModalOnDashboard}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-ocr-fields-populated"
        component={UiOcrFieldsPopulated}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-purchase-detail-with-chart"
        component={UiPurchaseDetailWithChart}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="ui-sent-confirmation"
        component={UiSentConfirmation}
        durationInFrames={60}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* ====================================================================== */}
      {/* PEER — NewVideo + 9 Scenes (for audit preview).                        */}
      {/* Pulled from origin/dev (no merge); shots/_shared restored from archive */}
      {/* (COPY) so peer's Erdun-design-system imports resolve. Each Scene also  */}
      {/* registered standalone for side-by-side preview vs CC's beats.          */}
      {/* ====================================================================== */}
      <Composition
        id="NewVideo"
        component={NewVideo}
        durationInFrames={NEW_VIDEO_DURATION_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-01-hook"
        component={Scene01Hook}
        durationInFrames={S1_HOOK_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-02-gap"
        component={Scene02Gap}
        durationInFrames={S2_GAP_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-03-meet"
        component={Scene03Meet}
        durationInFrames={S3_MEET_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-04-ingest"
        component={Scene04Ingest}
        durationInFrames={S4_INGEST_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-05-drop"
        component={Scene05Drop}
        durationInFrames={S5_DROP_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-06-democore"
        component={Scene06DemoCore}
        durationInFrames={S6_DEMO_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-07-platforms"
        component={Scene07Platforms}
        durationInFrames={S7_PLATFORMS_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-08-reach"
        component={Scene08Reach}
        durationInFrames={S8_REACH_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-09-sponsors"
        component={Scene09Sponsors}
        durationInFrames={S9_SPONSORS_F}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="peer-scene-10-close"
        component={Scene10Close}
        durationInFrames={S10_CLOSE_F}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* MASTER — full b01-b10 sequence for review (excludes legacy + b35). */}
      <Composition
        id="MasterDemo"
        component={MasterDemo}
        durationInFrames={8270}
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};
