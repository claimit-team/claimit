// Beat 09b — ARCH · techstack · NEW beat (after b09).
// Wraps the beat-local Scene08ReachTechstack fork (peer's techstack portion +
// Arize Phoenix). Silent (no matching VO). 300f.
import { AbsoluteFill } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Scene08ReachTechstack } from "./Scene08ReachTechstack";

export const Beat09b: React.FC = () => (
  <AbsoluteFill>
    <Scene08ReachTechstack />
    <BeatSubtitle
      text="The stack behind every claim — reasoned, stored, and fully traced."
      fromFrame={20}
      durationFrames={222}
    />
  </AbsoluteFill>
);
