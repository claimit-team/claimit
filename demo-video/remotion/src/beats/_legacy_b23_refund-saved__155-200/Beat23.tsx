// Beat 23 — Refund · saved as a fresh draft · 1:55-2:00 · 300f
// "Your wording, saved as a fresh draft." — ui-claimshell-assistant-active + Cursor at the version dropdown.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimshellAssistantActive } from "../../uirefs";

export const Beat23: React.FC = () => (
  <HookAtmosphere>
    <UiClaimshellAssistantActive />
    <Cursor
      keyframes={[
        { frame: 0, x: 420, y: 300 },
        { frame: 46, x: 330, y: 200 }, // the version dropdown ("v2 of 2 · Assistant rewrite")
      ]}
    />
    <Sequence name="vo_b23" from={6}>
      <Audio src={staticFile("audio/vo/vo_b23.mp3")} />
    </Sequence>
    <BeatSubtitle text="Your wording, saved as a fresh draft." fromFrame={6} durationFrames={156} />
  </HookAtmosphere>
);
