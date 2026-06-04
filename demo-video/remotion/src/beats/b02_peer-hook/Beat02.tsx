// Beat 02 — HOOK (wrapper around peer Scene01Hook) · 600f (cropped 720f→600f).
// Replaces the old CC b02. Peer scene is silent (no VO); CC adds a subtitle
// written from the on-screen content.
//
// CROP = START-CROP (`from={-120}`): the scene's payoff text — "Prices drop.
// Stores owe you. You never find out." — lands in the LAST ~2s (scene f600-719),
// so an end-crop would cut the punchline. Instead we drop the first 120f (early
// purchase-grid build-up) and keep the payoff at the beat's tail.
// CC subtitle captions the concrete example over the grid, then fades BEFORE the
// scene's own payoff text appears (scene f600 = beat f480) to avoid clashing.
import { AbsoluteFill, Sequence } from "remotion";

import { Scene01Hook } from "../../new-video/scenes/Scene01Hook";
import { BeatSubtitle } from "../../polish/BeatSubtitle";

export const Beat02: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={-120} durationInFrames={720}>
      <Scene01Hook />
    </Sequence>
    <BeatSubtitle
      text="Sony headphones: $399.99, now $349.99 — you're owed $50."
      fromFrame={20}
      durationFrames={330}
    />
  </AbsoluteFill>
);
