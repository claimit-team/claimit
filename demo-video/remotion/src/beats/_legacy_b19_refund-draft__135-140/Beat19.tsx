// Beat 19 — Refund · Gemini drafts the email · 1:35-1:40 · 300f
// "Then Gemini drafts the email with the right context." — ui-claimshell-loaded (v1 draft) + Cursor over the draft.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimshellLoaded } from "../../uirefs";

export const Beat19: React.FC = () => (
  <HookAtmosphere>
    <UiClaimshellLoaded />
    <Cursor
      keyframes={[
        { frame: 0, x: 560, y: 320 },
        { frame: 64, x: 600, y: 470 }, // resting over the drafted email body
      ]}
    />
    <Sequence name="vo_b19" from={6}>
      <Audio src={staticFile("audio/vo/vo_b19.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Then Gemini drafts the email with the right context."
      fromFrame={6}
      durationFrames={234}
    />
  </HookAtmosphere>
);
