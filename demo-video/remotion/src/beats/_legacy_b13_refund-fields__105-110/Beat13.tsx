// Beat 13 — Refund · fields · 1:05-1:10 · 300f
// "The merchant, the item, the date, and the price." — ui-ocr-fields-populated + Cursor sweeping each field.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiOcrFieldsPopulated } from "../../uirefs";

export const Beat13: React.FC = () => (
  <HookAtmosphere>
    <UiOcrFieldsPopulated />
    {/* Cursor walks the four extracted fields as the VO names them. */}
    <Cursor
      keyframes={[
        { frame: 0, x: 1360, y: 300 }, // Platform / merchant
        { frame: 70, x: 1360, y: 382 }, // Product / item
        { frame: 130, x: 1360, y: 560 }, // Purchase date
        { frame: 190, x: 1360, y: 472 }, // Purchase price
      ]}
    />
    <Sequence name="vo_b13" from={6}>
      <Audio src={staticFile("audio/vo/vo_b13.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="The merchant, the item, the date, and the price."
      fromFrame={6}
      durationFrames={229}
    />
  </HookAtmosphere>
);
