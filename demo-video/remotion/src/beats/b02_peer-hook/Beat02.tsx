// Beat 02 — HOOK (compressed peer Scene01Hook) · 600f.
// Uses the beat-local Scene01HookFast fork — peer's scene retimed IN-COMPONENT
// (no crop, no playbackRate, all content preserved). Subtitle captions the Sony
// price drop over the grid, then fades before the scene's own kicker payoff
// ("Prices drop. / Stores owe you. / You never find out." — fork f340+).
import { AbsoluteFill } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Scene01HookFast } from "./Scene01HookFast";

export const Beat02: React.FC = () => (
  <AbsoluteFill>
    <Scene01HookFast />
    <BeatSubtitle
      text="Sony headphones: $399.99, now $349.99 — you're owed $50."
      fromFrame={20}
      durationFrames={300}
    />
  </AbsoluteFill>
);
