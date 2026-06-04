// Beat 04 — HOOK (wrapper around peer Scene03Meet) · 720f (no crop).
// Replaces the old CC b04. Peer scene is silent; CC adds a subtitle written
// from the on-screen content.
import { AbsoluteFill } from "remotion";

import { Scene03Meet } from "../../new-video/scenes/Scene03Meet";
import { BeatSubtitle } from "../../polish/BeatSubtitle";

export const Beat04: React.FC = () => (
  <AbsoluteFill>
    <Scene03Meet />
    <BeatSubtitle
      text="Meet ClaimIt — it builds the refund claim for you."
      fromFrame={24}
      durationFrames={660}
    />
  </AbsoluteFill>
);
