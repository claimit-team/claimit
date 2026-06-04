// Beat 21 — Refund · friendlier version ready · 1:45-1:50 · 300f
// "Seconds later, the new version is ready to review." — ui-claimshell-assistant-active (v2 + reply) + Cursor → new draft.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimshellAssistantActive } from "../../uirefs";

export const Beat21: React.FC = () => (
  <HookAtmosphere>
    <UiClaimshellAssistantActive />
    <Cursor
      keyframes={[
        { frame: 0, x: 985, y: 1000 }, // from the assistant exchange
        { frame: 54, x: 600, y: 320 }, // to the v2 "Assistant rewrite" draft
      ]}
    />
    <Sequence name="vo_b21" from={6}>
      <Audio src={staticFile("audio/vo/vo_b21.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Seconds later, the new version is ready to review."
      fromFrame={6}
      durationFrames={198}
    />
  </HookAtmosphere>
);
