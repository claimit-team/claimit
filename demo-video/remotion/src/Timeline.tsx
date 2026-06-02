// Timeline — the single ClaimItFilm composition. Places the four Acts
// at their global offsets. No top-level grade/grain — each Scene owns
// its own per spec §1.8.

import { Sequence } from "remotion";

import { ActI_Hook } from "./acts/ActI_Hook";
import { ActII_Arrival } from "./acts/ActII_Arrival";
import { ActIII_Stage } from "./acts/ActIII_Stage";
import { ActIV_Close } from "./acts/ActIV_Close";
import { AudioMix } from "./audio/AudioMix";
import { SubtitleLayer } from "./audio/SubtitleLayer";
import {
  ACT_I_DURATION_F,
  ACT_II_DURATION_F,
  ACT_III_DURATION_F,
  ACT_IV_DURATION_F,
  TOTAL_DURATION_F,
} from "./shots/_shared/durations";

export const TIMELINE_DURATION_FRAMES = TOTAL_DURATION_F; // 10800

const ACT_II_OFFSET = ACT_I_DURATION_F; // 1080
const ACT_III_OFFSET = ACT_II_OFFSET + ACT_II_DURATION_F; // 2160
const ACT_IV_OFFSET = ACT_III_OFFSET + ACT_III_DURATION_F; // 7860

export const Timeline: React.FC = () => {
  return (
    <>
      <Sequence from={0} durationInFrames={ACT_I_DURATION_F}>
        <ActI_Hook />
      </Sequence>
      <Sequence from={ACT_II_OFFSET} durationInFrames={ACT_II_DURATION_F}>
        <ActII_Arrival />
      </Sequence>
      <Sequence from={ACT_III_OFFSET} durationInFrames={ACT_III_DURATION_F}>
        <ActIII_Stage />
      </Sequence>
      <Sequence from={ACT_IV_OFFSET} durationInFrames={ACT_IV_DURATION_F}>
        <ActIV_Close />
      </Sequence>
      {/* Audio + subtitles — siblings of the Acts, span the full composition */}
      <AudioMix />
      <SubtitleLayer />
    </>
  );
};
