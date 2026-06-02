// Act I — Hook (Shots 1–3) · 1080 f total.
// Self-contained shots placed via <Sequence>. No cross-act transition
// in this Act; Shot 4 (Act II) owns the dark→light handoff.

import { Sequence } from "remotion";

import {
  SHOT_01_DURATION_F,
  SHOT_02_DURATION_F,
  SHOT_03_DURATION_F,
} from "../shots/_shared/durations";
import { Shot01 } from "../shots/shot-01-coldopen__0000-0003/Shot01";
import { Shot02 } from "../shots/shot-02-things__0003-0012/Shot02";
import { Shot03 } from "../shots/shot-03-gap__0012-0018/Shot03";

export const ActI_Hook: React.FC = () => {
  return (
    <>
      <Sequence from={0} durationInFrames={SHOT_01_DURATION_F}>
        <Shot01 />
      </Sequence>
      <Sequence from={SHOT_01_DURATION_F} durationInFrames={SHOT_02_DURATION_F}>
        <Shot02 />
      </Sequence>
      <Sequence
        from={SHOT_01_DURATION_F + SHOT_02_DURATION_F}
        durationInFrames={SHOT_03_DURATION_F}
      >
        <Shot03 />
      </Sequence>
    </>
  );
};
