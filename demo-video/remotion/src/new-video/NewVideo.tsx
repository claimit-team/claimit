// ClaimIt — New Demo Video (v2). Upbeat product demo, 3:00 @ 60fps.
// Reuses the shot design system (tokens/Stage/Camera/scenes) and the
// REAL apps/web components (ClaimDetailShell, price chart, draft
// renderers) via the existing shim layer. See ./SCRIPT.md.
//
// Each scene is its own <Series.Sequence> so useCurrentFrame() is
// scene-local (starts at 0). The demo core (workspace → approve →
// money) is ONE sequence so the ClaimDetailShell mounts only once.

import { Series } from "remotion";

import * as D from "./durations";
import { Scene01Hook } from "./scenes/Scene01Hook";
import { Scene02Gap } from "./scenes/Scene02Gap";
import { Scene03Meet } from "./scenes/Scene03Meet";
import { Scene04Ingest } from "./scenes/Scene04Ingest";
import { Scene05Drop } from "./scenes/Scene05Drop";
import { Scene06DemoCore } from "./scenes/Scene06DemoCore";
import { Scene07Platforms } from "./scenes/Scene07Platforms";
import { Scene08Reach } from "./scenes/Scene08Reach";
import { Scene09Sponsors } from "./scenes/Scene09Sponsors";
import { Scene10Close } from "./scenes/Scene10Close";

export const NewVideo: React.FC = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={D.S1_HOOK_F}>
        <Scene01Hook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S2_GAP_F}>
        <Scene02Gap />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S3_MEET_F}>
        <Scene03Meet />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S4_INGEST_F}>
        <Scene04Ingest />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S5_DROP_F}>
        <Scene05Drop />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S6_DEMO_F}>
        <Scene06DemoCore />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S7_PLATFORMS_F}>
        <Scene07Platforms />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S8_REACH_F}>
        <Scene08Reach />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S9_SPONSORS_F}>
        <Scene09Sponsors />
      </Series.Sequence>
      <Series.Sequence durationInFrames={D.S10_CLOSE_F}>
        <Scene10Close />
      </Series.Sequence>
    </Series>
  );
};
