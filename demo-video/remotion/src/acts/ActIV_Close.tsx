// Act IV — Close (Shots 15, 16, 17, 17B, 18) · 2940 f total.
// Shot 15 owns the light→dark fall that bleeds into Shot 16. Shot 17
// hands off to the new Shot 17B tech wall. Shot 18 closes on near-
// black, mirroring Shot 1.

import { Sequence } from "remotion";

import {
  SHOT_15_DURATION_F,
  SHOT_16_DURATION_F,
  SHOT_17_DURATION_F,
  SHOT_17B_DURATION_F,
  SHOT_18_DURATION_F,
} from "../shots/_shared/durations";
import { Shot15 } from "../shots/shot-15-boundary__0211-0230/Shot15";
import { Shot16 } from "../shots/shot-16-seed__0230-0241/Shot16";
import { Shot17 } from "../shots/shot-17-tagline__0241-0252/Shot17";
import { Shot17b } from "../shots/shot-17b-techstack__0247-0254/Shot17b";
import { Shot18 } from "../shots/shot-18-signoff__0252-0300/Shot18";

const ACT_IV_S16_OFFSET = SHOT_15_DURATION_F;
const ACT_IV_S17_OFFSET = ACT_IV_S16_OFFSET + SHOT_16_DURATION_F;
const ACT_IV_S17B_OFFSET = ACT_IV_S17_OFFSET + SHOT_17_DURATION_F;
const ACT_IV_S18_OFFSET = ACT_IV_S17B_OFFSET + SHOT_17B_DURATION_F;

export const ActIV_Close: React.FC = () => {
  return (
    <>
      <Sequence from={0} durationInFrames={SHOT_15_DURATION_F}>
        <Shot15 />
      </Sequence>
      <Sequence from={ACT_IV_S16_OFFSET} durationInFrames={SHOT_16_DURATION_F}>
        <Shot16 />
      </Sequence>
      <Sequence from={ACT_IV_S17_OFFSET} durationInFrames={SHOT_17_DURATION_F}>
        <Shot17 />
      </Sequence>
      <Sequence from={ACT_IV_S17B_OFFSET} durationInFrames={SHOT_17B_DURATION_F}>
        <Shot17b />
      </Sequence>
      <Sequence from={ACT_IV_S18_OFFSET} durationInFrames={SHOT_18_DURATION_F}>
        <Shot18 />
      </Sequence>
    </>
  );
};
