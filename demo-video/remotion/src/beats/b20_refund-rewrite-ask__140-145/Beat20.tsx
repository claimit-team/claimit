// Beat 20 — Refund · ask for a warmer tone · 1:40-1:45 · 300f
// "Ask for a warmer tone, and it rewrites it." — ui-claimshell-loaded + Cursor clicks the "Make it friendlier" quick action.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimshellLoaded } from "../../uirefs";

export const Beat20: React.FC = () => (
  <HookAtmosphere>
    <UiClaimshellLoaded />
    <Cursor
      keyframes={[
        { frame: 0, x: 760, y: 760 },
        { frame: 44, x: 985, y: 1002 }, // "Make it friendlier" quick action chip
      ]}
      clicks={[{ frame: 54 }]}
    />
    <Sequence name="vo_b20" from={6}>
      <Audio src={staticFile("audio/vo/vo_b20.mp3")} />
    </Sequence>
    <BeatSubtitle text="Ask for a warmer tone, and it rewrites it." fromFrame={6} durationFrames={167} />
  </HookAtmosphere>
);
