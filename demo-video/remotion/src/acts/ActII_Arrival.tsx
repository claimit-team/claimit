// Act II — Arrival (Shots 4–5) · 1080 f total.
// Shot 4 owns the dark→light handoff that bleeds into Shot 5's light
// canvas. Timeline does NOT add a transition at the Act boundary.

import { Sequence } from "remotion";

import { SHOT_04_DURATION_F, SHOT_05_DURATION_F } from "../shots/_shared/durations";
import { Shot04 } from "../shots/shot-04-light-logo__0018-0028/Shot04";
import { Shot05 } from "../shots/shot-05-whatitis__0028-0036/Shot05";

export const ActII_Arrival: React.FC = () => {
  return (
    <>
      <Sequence from={0} durationInFrames={SHOT_04_DURATION_F}>
        <Shot04 />
      </Sequence>
      <Sequence from={SHOT_04_DURATION_F} durationInFrames={SHOT_05_DURATION_F}>
        <Shot05 />
      </Sequence>
    </>
  );
};
