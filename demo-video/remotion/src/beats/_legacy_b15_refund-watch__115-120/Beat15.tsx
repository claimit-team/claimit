// Beat 15 — Refund · background watch (dashboard) · 1:15-1:20 · 300f
// "Then it watches the claim window in the background." — ui-dashboard-loaded + Cursor over monitored row.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiDashboardLoaded } from "../../uirefs";

export const Beat15: React.FC = () => (
  <HookAtmosphere>
    <UiDashboardLoaded />
    <Cursor
      keyframes={[
        { frame: 0, x: 1100, y: 520 },
        { frame: 52, x: 1500, y: 822 }, // Monitored purchases · "21 days remaining"
      ]}
    />
    <Sequence name="vo_b15" from={6}>
      <Audio src={staticFile("audio/vo/vo_b15.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Then it watches the claim window in the background."
      fromFrame={6}
      durationFrames={173}
    />
  </HookAtmosphere>
);
