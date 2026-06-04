// Beat 24 — Refund · review then approve · 2:00-2:05 · 300f
// "Review it once, then approve." — ui-claimshell-loaded + Cursor travels from the draft toward Approve.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimshellLoaded } from "../../uirefs";

export const Beat24: React.FC = () => (
  <HookAtmosphere>
    <UiClaimshellLoaded />
    <Cursor
      keyframes={[
        { frame: 0, x: 600, y: 440 }, // reviewing the draft
        { frame: 70, x: 1760, y: 112 }, // arriving at the "Approve and send" button
      ]}
    />
    <Sequence name="vo_b24" from={6}>
      <Audio src={staticFile("audio/vo/vo_b24.mp3")} />
    </Sequence>
    <BeatSubtitle text="Review it once, then approve." fromFrame={6} durationFrames={131} />
  </HookAtmosphere>
);
