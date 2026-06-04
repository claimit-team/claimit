// Beat 14 — Refund · confirm/correct fields · 1:10-1:15 · 300f
// "Each value lifted from the receipt — yours to check and correct." — ui-ocr-fields-populated + Cursor → Confirm.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiOcrFieldsPopulated } from "../../uirefs";

export const Beat14: React.FC = () => (
  <HookAtmosphere>
    <UiOcrFieldsPopulated />
    <Cursor
      keyframes={[
        { frame: 0, x: 1360, y: 470 },
        { frame: 60, x: 1760, y: 1035 }, // Confirm & start monitoring
      ]}
      clicks={[{ frame: 72 }]}
    />
    <Sequence name="vo_b14" from={6}>
      <Audio src={staticFile("audio/vo/vo_b14.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Each value lifted from the receipt — yours to check and correct."
      fromFrame={6}
      durationFrames={256}
    />
  </HookAtmosphere>
);
