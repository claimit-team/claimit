// Beat 26 — Refund · sent confirmation · 2:10-2:15 · 300f
// "A banner confirms it — sent from your own Gmail." — ui-sent-confirmation (banner + sonner toast) + Cursor near banner.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiSentConfirmation } from "../../uirefs";

export const Beat26: React.FC = () => (
  <HookAtmosphere>
    <UiSentConfirmation />
    <Cursor
      keyframes={[
        { frame: 0, x: 1000, y: 320 },
        { frame: 48, x: 720, y: 156 }, // the "Submitted — sending from your Gmail" banner
      ]}
    />
    <Sequence name="vo_b26" from={6}>
      <Audio src={staticFile("audio/vo/vo_b26.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="A banner confirms it — sent from your own Gmail."
      fromFrame={6}
      durationFrames={195}
    />
  </HookAtmosphere>
);
