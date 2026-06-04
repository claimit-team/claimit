// Beat 29 — Credibility · claim channels · 2:26-2:32 · 300f
// Subtitle = TRIMMED v3.1 text. Audio = OLD long take (~8.5s) per BEAT_SHEET
// note — temporary, acceptable mismatch (do NOT regenerate; API key revoked).
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { RetailerLogoGrid } from "../../shims/RetailerLogoGrid";
import { Stage } from "../../shims/Stage";

export const Beat29: React.FC = () => (
  <HookAtmosphere>
    <Stage>
      <RetailerLogoGrid showChannelPills />
    </Stage>
    <Sequence name="vo_b29" from={6}>
      <Audio src={staticFile("audio/vo/vo_b29.mp3")} />
    </Sequence>
    <BeatSubtitle
      text="Some run on auto-send. Best Buy and Target use a chat script today."
      fromFrame={6}
      durationFrames={270}
    />
  </HookAtmosphere>
);
