// Beat 03 — HOOK (wrapper around peer Scene02Gap) · 1080f (no crop).
// Replaces the old CC b03. Peer scene is silent; CC adds a subtitle written
// from the on-screen content.
import { AbsoluteFill } from "remotion";

import { Scene02Gap } from "../../new-video/scenes/Scene02Gap";
import { BeatSubtitle } from "../../polish/BeatSubtitle";

export const Beat03: React.FC = () => (
  <AbsoluteFill>
    <Scene02Gap />
    {/* On-screen: "Most big retailers will refund a price drop." + amber "$10B+"
        + "left unclaimed by shoppers every year." Subtitle is the spoken synthesis. */}
    <BeatSubtitle
      text="Most stores will refund a price drop — almost no one claims it."
      fromFrame={30}
      durationFrames={820}
    />
  </AbsoluteFill>
);
