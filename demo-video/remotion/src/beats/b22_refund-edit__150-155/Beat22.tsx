// Beat 22 — Refund · quick manual edit · 1:50-1:55 · 300f
// "Or make a quick edit yourself." — ui-claimshell-loaded + Cursor → Edit tab.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimshellLoaded } from "../../uirefs";

export const Beat22: React.FC = () => (
  <HookAtmosphere>
    <UiClaimshellLoaded />
    <Cursor
      keyframes={[
        { frame: 0, x: 560, y: 360 },
        { frame: 42, x: 360, y: 248 }, // the "Edit" tab on the draft pane
      ]}
      clicks={[{ frame: 50 }]}
    />
    <Sequence name="vo_b22" from={6}>
      <Audio src={staticFile("audio/vo/vo_b22.mp3")} />
    </Sequence>
    <BeatSubtitle text="Or make a quick edit yourself." fromFrame={6} durationFrames={120} />
  </HookAtmosphere>
);
