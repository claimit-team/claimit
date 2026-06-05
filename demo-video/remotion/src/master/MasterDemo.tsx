// Master composition — chains Beat01..Beat10 end-to-end (HOOK → ARCH → DEMO →
// PAYOFF) into one continuous film for review. No new visual work: each beat is
// wrapped in a <Series.Sequence> with its EXACT duration copied verbatim from
// Root.tsx (the source of truth). Excludes the _legacy_ beats and b35.
//   240 + 600 + 540 + 300 + 2280 + 960 + 760 + 1150 + 880 + 560 = 8270f (≈ 2:18 @ 60fps)
import { Series } from "remotion";

import { Beat01 } from "../beats/b01_hook-cracks__000-005/Beat01";
import { Beat02 } from "../beats/b02_peer-hook/Beat02";
import { Beat03 } from "../beats/b03_peer-gap/Beat03";
import { Beat04 } from "../beats/b04_peer-meet/Beat04";
import { Beat05 } from "../beats/b05_arch-master/Beat05";
import { Beat06 } from "../beats/b06_demo-upload-extract/Beat06";
import { Beat07 } from "../beats/b07_demo-monitor-drop/Beat07";
import { Beat08 } from "../beats/b08_demo-3panel-claimshell/Beat08";
import { Beat09 } from "../beats/b09_demo-reach-policies/Beat09";
import { Beat10 } from "../beats/b10_payoff-claimit/Beat10";

export const MasterDemo: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={240}>
      <Beat01 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={600}>
      <Beat02 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={540}>
      <Beat03 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={300}>
      <Beat04 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={2280}>
      <Beat05 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={960}>
      <Beat06 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={760}>
      <Beat07 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={1150}>
      <Beat08 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={880}>
      <Beat09 />
    </Series.Sequence>
    <Series.Sequence durationInFrames={560}>
      <Beat10 />
    </Series.Sequence>
  </Series>
);
