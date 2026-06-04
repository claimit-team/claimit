// Beat 06 — Architecture · Gemini extracts · 0:26-0:32 · 300f
// "Gemini reads it and pulls out the merchant, item, date, and price."
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { ArchFlow } from "../../shims/ArchFlow";

export const Beat06: React.FC = () => (
  <HookAtmosphere>
    <ArchFlow litCount={2} />
    <Sequence name="vo_b06" from={10}>
      <Audio src={staticFile("audio/vo/vo_b06.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Gemini reads it and pulls out the merchant, item, date, and price."
      fromFrame={10}
      durationFrames={320}
    />
  </HookAtmosphere>
);
