// Beat 18 — Refund · policy check · 1:30-1:35 · 300f
// "It checks the policy, so you do not have to." — ui-purchase-detail-with-chart + Cursor → refund-eligibility policy.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiPurchaseDetailWithChart } from "../../uirefs";

export const Beat18: React.FC = () => (
  <HookAtmosphere>
    <UiPurchaseDetailWithChart />
    <Cursor
      keyframes={[
        { frame: 0, x: 1100, y: 560 },
        { frame: 50, x: 745, y: 868 }, // "Read full policy" in Refund eligibility
      ]}
      clicks={[{ frame: 60 }]}
    />
    <Sequence name="vo_b18" from={6}>
      <Audio src={staticFile("audio/vo/vo_b18.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="It checks the policy, so you do not have to."
      fromFrame={6}
      durationFrames={167}
    />
  </HookAtmosphere>
);
