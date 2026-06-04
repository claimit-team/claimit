// Beat 08 — Architecture · agent drafts the claim · 0:38-0:44 · 300f
// "When a drop clears the policy, the agent drafts the claim for you."
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { ArchFlow } from "../../shims/ArchFlow";

export const Beat08: React.FC = () => (
  <HookAtmosphere>
    <ArchFlow litCount={4} />
    <Sequence name="vo_b08" from={6}>
      <Audio src={staticFile("audio/vo/vo_b08.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="When a drop clears the policy, the agent drafts the claim for you."
      fromFrame={6}
      durationFrames={262}
    />
  </HookAtmosphere>
);
