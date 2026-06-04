// Beat 07 — Architecture · MongoDB + monitoring agent · 0:32-0:38 · 300f
// "It's stored in MongoDB, and an agent watches the price and the claim window."
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { ArchFlow } from "../../shims/ArchFlow";

export const Beat07: React.FC = () => (
  <HookAtmosphere>
    <ArchFlow litCount={3} />
    <Sequence name="vo_b07" from={6}>
      <Audio src={staticFile("audio/vo/vo_b07.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="It's stored in MongoDB, and an agent watches the price and the claim window."
      fromFrame={6}
      durationFrames={295}
    />
  </HookAtmosphere>
);
