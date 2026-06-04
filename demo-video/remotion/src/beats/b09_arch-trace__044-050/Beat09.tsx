// Beat 09 — Architecture · approval + Phoenix tracing · 0:44-0:50 · 300f
// "You approve it — and every decision, tool call, and draft is traced."
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { ArchFlow } from "../../shims/ArchFlow";

export const Beat09: React.FC = () => (
  <HookAtmosphere>
    <ArchFlow litCount={5} />
    <Sequence name="vo_b09" from={6}>
      <Audio src={staticFile("audio/vo/vo_b09.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="You approve it — and every decision, tool call, and draft is traced."
      fromFrame={6}
      durationFrames={298}
    />
  </HookAtmosphere>
);
