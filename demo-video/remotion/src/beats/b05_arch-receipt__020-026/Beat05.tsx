// Beat 05 — Architecture · receipt enters · 0:20-0:26 · 300f
// "A receipt reaches ClaimIt — forwarded from your inbox, or uploaded by hand."
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { ArchFlow } from "../../shims/ArchFlow";

export const Beat05: React.FC = () => (
  <HookAtmosphere>
    <ArchFlow litCount={1} />
    <Sequence name="vo_b05" from={6}>
      <Audio src={staticFile("audio/vo/vo_b05.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="A receipt reaches ClaimIt — forwarded from your inbox, or uploaded by hand."
      fromFrame={6}
      durationFrames={320}
    />
  </HookAtmosphere>
);
