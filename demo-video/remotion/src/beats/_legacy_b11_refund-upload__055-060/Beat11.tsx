// Beat 11 — Refund · upload · 0:55-1:00 · 300f
// "Upload a photo or a PDF — or let ClaimIt read it from your inbox." — ui-upload-modal-on-dashboard + Cursor.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiUploadModalOnDashboard } from "../../uirefs";

export const Beat11: React.FC = () => (
  <HookAtmosphere>
    <UiUploadModalOnDashboard />
    <Cursor
      keyframes={[
        { frame: 0, x: 1060, y: 540 },
        { frame: 42, x: 960, y: 545 },
      ]}
      clicks={[{ frame: 52 }]}
    />
    <Sequence name="vo_b11" from={6}>
      <Audio src={staticFile("audio/vo/vo_b11.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Upload a photo or a PDF — or let ClaimIt read it from your inbox."
      fromFrame={6}
      durationFrames={278}
    />
  </HookAtmosphere>
);
