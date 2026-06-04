// Beat 17 — Refund · price drop detected · 1:25-1:30 · 300f
// "When Costco drops the price, ClaimIt catches it." — ui-purchase-detail-with-chart + Cursor onto the drop dot.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiPurchaseDetailWithChart } from "../../uirefs";

export const Beat17: React.FC = () => (
  <HookAtmosphere>
    <UiPurchaseDetailWithChart />
    <Cursor
      keyframes={[
        { frame: 0, x: 1060, y: 430 },
        { frame: 46, x: 1223, y: 537 }, // the amber drop dot (May 31, $499.99)
      ]}
      clicks={[{ frame: 54 }]}
    />
    <Sequence name="vo_b17" from={6}>
      <Audio src={staticFile("audio/vo/vo_b17.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="When Costco drops the price, ClaimIt catches it."
      fromFrame={6}
      durationFrames={190}
    />
  </HookAtmosphere>
);
