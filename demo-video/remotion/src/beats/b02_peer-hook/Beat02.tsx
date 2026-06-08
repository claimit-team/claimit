// Beat 02 — HOOK · 600f. Single-product, sense-of-time open (rebuilt).
// Scene01HookFast now focuses on ONE purchase (Sony WH-1000XM5): the card holds
// while a price-match window fills day-by-day, then the price drops and an
// "owed $50" badge pops. Two subtitles narrate the wait, then the drop.
import { AbsoluteFill } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Scene01HookFast } from "./Scene01HookFast";

export const Beat02: React.FC = () => (
  <AbsoluteFill>
    <Scene01HookFast />
    <BeatSubtitle
      text="You bought the Sony WH-1000XM5 for $399.99."
      fromFrame={24}
      durationFrames={250}
    />
    <BeatSubtitle
      text="Days later, it drops to $349.99 — you're owed $50."
      fromFrame={330}
      durationFrames={250}
    />
  </AbsoluteFill>
);
