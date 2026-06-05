// Beat 28 — Credibility · 26 retailers mapped · 2:20-2:26 · 300f
// "We mapped refund policies across twenty-six retailers."
import { Audio, Sequence, staticFile, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { RetailerLogoGrid } from "../../shims/RetailerLogoGrid";
import { Stage } from "../../shims/Stage";

export const Beat28: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = Math.max(0, Math.min(26, Math.floor((frame - 10) / 6.5)));
  return (
    <HookAtmosphere>
      <Stage>
        <RetailerLogoGrid revealCount={reveal} />
      </Stage>
      <Sequence name="vo_b28" from={6}>
        <Audio src={staticFile("audio/vo/vo_b28.mp3")} />
      </Sequence>
      <BeatSubtitle
        text="We mapped refund policies across twenty-six retailers."
        fromFrame={6}
        durationFrames={245}
      />
    </HookAtmosphere>
  );
};
