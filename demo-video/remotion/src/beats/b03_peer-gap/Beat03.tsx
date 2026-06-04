// Beat 03 — HOOK (compressed peer Scene02Gap) · 540f.
// Uses the beat-local Scene02GapFast fork (1080f→540f via transition
// compression — no crop). Subtitle fades before the scene's footnote
// (fork f410) so the bottom-of-frame doesn't double up.
import { AbsoluteFill } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Scene02GapFast } from "./Scene02GapFast";

export const Beat03: React.FC = () => (
  <AbsoluteFill>
    <Scene02GapFast />
    <BeatSubtitle
      text="Most stores will refund a price drop — almost no one claims it."
      fromFrame={40}
      durationFrames={360}
    />
  </AbsoluteFill>
);
