// Beat 16 — Refund · days pass (price history) · 1:20-1:25 · 300f
// "Days pass, and it keeps checking the price for you." — ui-purchase-detail-with-chart + Cursor tracing the line.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiPurchaseDetailWithChart } from "../../uirefs";

export const Beat16: React.FC = () => (
  <HookAtmosphere>
    <UiPurchaseDetailWithChart />
    <Cursor
      keyframes={[
        { frame: 0, x: 740, y: 430 },
        { frame: 70, x: 1060, y: 430 }, // along the flat price line
      ]}
    />
    <Sequence name="vo_b16" from={6}>
      <Audio src={staticFile("audio/vo/vo_b16.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Days pass, and it keeps checking the price for you."
      fromFrame={6}
      durationFrames={195}
    />
  </HookAtmosphere>
);
