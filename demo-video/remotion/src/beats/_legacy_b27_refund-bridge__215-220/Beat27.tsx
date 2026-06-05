// Beat 27 — Refund · claims list bridge · 2:15-2:20 · 300f
// "Every claim, tracked from draft to outcome." — ui-claims-list + Cursor down the claims table.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimsList } from "../../uirefs";

export const Beat27: React.FC = () => (
  <HookAtmosphere>
    <UiClaimsList />
    <Cursor
      keyframes={[
        { frame: 0, x: 1000, y: 380 },
        { frame: 50, x: 1000, y: 440 }, // first claim row (Costco)
        { frame: 130, x: 1000, y: 560 }, // down the tracked claims
      ]}
    />
    <Sequence name="vo_b27" from={6}>
      <Audio src={staticFile("audio/vo/vo_b27.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Every claim, tracked from draft to outcome."
      fromFrame={6}
      durationFrames={184}
    />
  </HookAtmosphere>
);
