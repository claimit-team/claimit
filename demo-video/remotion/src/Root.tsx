import "./globals.css";
// Side-effect import: kicks off the Inter font load + registers the
// delayRender handle so no frame paints with a fallback.
import "./polish/font";

import { Composition } from "remotion";
import {
  Shot06Debug,
  Shot07Debug,
  Shot08Debug,
  Shot09Debug,
  Shot10Debug,
  Shot11Debug,
  Shot12Debug,
  Shot13Debug,
  Shot14Debug,
} from "./acts/ActIII_Stage";
import {
  SHOT_01_DURATION_F,
  SHOT_02_DURATION_F,
  SHOT_03_DURATION_F,
  SHOT_04_DURATION_F,
  SHOT_05_DURATION_F,
  SHOT_06_DURATION_F,
  SHOT_07_DURATION_F,
  SHOT_08_DURATION_F,
  SHOT_09_DURATION_F,
  SHOT_10_DURATION_F,
  SHOT_11_DURATION_F,
  SHOT_12_DURATION_F,
  SHOT_13_DURATION_F,
  SHOT_14_DURATION_F,
  SHOT_15_DURATION_F,
  SHOT_16_DURATION_F,
  SHOT_17_DURATION_F,
  SHOT_17B_DURATION_F,
  SHOT_18_DURATION_F,
} from "./shots/_shared/durations";
import { Shot01 } from "./shots/shot-01-coldopen__0000-0003/Shot01";
import { Shot02 } from "./shots/shot-02-things__0003-0012/Shot02";
import { Shot03 } from "./shots/shot-03-gap__0012-0018/Shot03";
import { Shot04 } from "./shots/shot-04-light-logo__0018-0028/Shot04";
import { Shot05 } from "./shots/shot-05-whatitis__0028-0036/Shot05";
import { Shot15 } from "./shots/shot-15-boundary__0211-0230/Shot15";
import { Shot16 } from "./shots/shot-16-seed__0230-0241/Shot16";
import { Shot17 } from "./shots/shot-17-tagline__0241-0252/Shot17";
import { Shot17b } from "./shots/shot-17b-techstack__0247-0254/Shot17b";
import { Shot18 } from "./shots/shot-18-signoff__0252-0300/Shot18";
import { TIMELINE_DURATION_FRAMES, Timeline } from "./Timeline";

const FPS = 60;
const W = 1920;
const H = 1080;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="ClaimItFilm"
        component={Timeline}
        durationInFrames={TIMELINE_DURATION_FRAMES}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot01"
        component={Shot01}
        durationInFrames={SHOT_01_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot02"
        component={Shot02}
        durationInFrames={SHOT_02_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot03"
        component={Shot03}
        durationInFrames={SHOT_03_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot04"
        component={Shot04}
        durationInFrames={SHOT_04_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot05"
        component={Shot05}
        durationInFrames={SHOT_05_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot06"
        component={Shot06Debug}
        durationInFrames={SHOT_06_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot07"
        component={Shot07Debug}
        durationInFrames={SHOT_07_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot08"
        component={Shot08Debug}
        durationInFrames={SHOT_08_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot09"
        component={Shot09Debug}
        durationInFrames={SHOT_09_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot10"
        component={Shot10Debug}
        durationInFrames={SHOT_10_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot11"
        component={Shot11Debug}
        durationInFrames={SHOT_11_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot12"
        component={Shot12Debug}
        durationInFrames={SHOT_12_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot13"
        component={Shot13Debug}
        durationInFrames={SHOT_13_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot14"
        component={Shot14Debug}
        durationInFrames={SHOT_14_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot15"
        component={Shot15}
        durationInFrames={SHOT_15_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot16"
        component={Shot16}
        durationInFrames={SHOT_16_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot17"
        component={Shot17}
        durationInFrames={SHOT_17_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot17b"
        component={Shot17b}
        durationInFrames={SHOT_17B_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Shot18"
        component={Shot18}
        durationInFrames={SHOT_18_DURATION_F}
        fps={FPS}
        width={W}
        height={H}
      />
    </>
  );
};
