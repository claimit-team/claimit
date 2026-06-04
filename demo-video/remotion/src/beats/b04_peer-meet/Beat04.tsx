// Beat 04 — HOOK (compressed peer Scene03Meet) · 300f.
// Uses the beat-local Scene03MeetFast fork (720f→300f; the fork owns the 60f
// cinematic fade-out + scale-down). Subtitle ends before the fade (fork f240).
import { AbsoluteFill } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Scene03MeetFast } from "./Scene03MeetFast";

export const Beat04: React.FC = () => (
  <AbsoluteFill>
    <Scene03MeetFast />
    <BeatSubtitle
      text="Meet ClaimIt — it builds the refund claim for you."
      fromFrame={24}
      durationFrames={200}
    />
  </AbsoluteFill>
);
