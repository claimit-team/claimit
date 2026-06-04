// Beat 12 — Refund · extraction begins · 1:00-1:05 · 300f
// "ClaimIt pulls out the details for you." — ui-ocr-fields-populated + Cursor.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiOcrFieldsPopulated } from "../../uirefs";

export const Beat12: React.FC = () => (
  <HookAtmosphere>
    <UiOcrFieldsPopulated />
    <Cursor
      keyframes={[
        { frame: 0, x: 1340, y: 540 },
        { frame: 48, x: 1360, y: 300 },
      ]}
    />
    <Sequence name="vo_b12" from={6}>
      <Audio src={staticFile("audio/vo/vo_b12.mp3")} />
    </Sequence>
    <BeatSubtitle text="ClaimIt pulls out the details for you." fromFrame={6} durationFrames={145} />
  </HookAtmosphere>
);
