// Beat 10 — Refund · receipt intro · 0:50-0:55 · 300f
// "It starts with a receipt." — rebuilt on ui-app-shell-empty + Cursor (DEMO_INTERACTION_SPEC_v1 P3).
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiAppShellEmpty } from "../../uirefs";

export const Beat10: React.FC = () => (
  <HookAtmosphere>
    <UiAppShellEmpty />
    <Cursor
      keyframes={[
        { frame: 0, x: 820, y: 640 },
        { frame: 50, x: 1088, y: 486 },
      ]}
    />
    <Sequence name="vo_b10" from={6}>
      <Audio src={staticFile("audio/vo/vo_b10.mp3")} />
    </Sequence>
    <BeatSubtitle text="It starts with a receipt." fromFrame={6} durationFrames={100} />
  </HookAtmosphere>
);
