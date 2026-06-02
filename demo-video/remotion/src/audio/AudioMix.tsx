// AudioMix — three-layer mix (music + 17 VO + 10 SFX) rendered as a
// sibling of the Acts inside Timeline.tsx. No visual content.
//
// Music ducking is per-frame, computed in JS — no ffmpeg sidechain
// post-render step. Each VO window pulls the music down to
// MUSIC_DUCKED with an 8-frame triangular ease; the S12 heart-beat
// hold dips further to MUSIC_S12_QUIET so the green money beat sits
// in near-silence.

import { Audio, interpolate, Sequence, staticFile } from "remotion";

import {
  DUCK_FADE_F,
  MUSIC_BASE,
  MUSIC_DUCKED,
  MUSIC_S12_QUIET,
  SFX_MONEY_VOLUME,
  SFX_TIMING,
  SFX_VOLUME,
  VO_TIMING,
  VO_VOLUME,
} from "./timing";

// Heart-beat hold window (S12 starts at global f5040, the green money
// turn is around f5120, then the visible HOLD runs until f5460 before
// the bg lifts back).
const S12_QUIET_START_F = 5040;
const S12_QUIET_END_F = 5460;

function musicVolumeAt(frame: number): number {
  // S12 emotional hold — strongest music duck of the whole film.
  if (frame >= S12_QUIET_START_F && frame <= S12_QUIET_END_F) {
    return interpolate(
      frame,
      [S12_QUIET_START_F, S12_QUIET_START_F + 30, S12_QUIET_END_F - 30, S12_QUIET_END_F],
      [MUSIC_DUCKED, MUSIC_S12_QUIET, MUSIC_S12_QUIET, MUSIC_DUCKED],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }
  // Per-VO duck: triangular ease around each window.
  let v = MUSIC_BASE;
  for (const vo of VO_TIMING) {
    const a = vo.startF - DUCK_FADE_F;
    const b = vo.startF;
    const c = vo.endF;
    const d = vo.endF + DUCK_FADE_F;
    if (frame >= a && frame <= d) {
      const ducked = interpolate(
        frame,
        [a, b, c, d],
        [MUSIC_BASE, MUSIC_DUCKED, MUSIC_DUCKED, MUSIC_BASE],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      v = Math.min(v, ducked);
    }
  }
  return v;
}

export const AudioMix: React.FC = () => (
  <>
    {/* Music bed — full 180 s, ducked per-frame */}
    <Audio src={staticFile("audio/music/claimit_music_bed.mp3")} volume={(f) => musicVolumeAt(f)} />

    {/* 17 VO segments */}
    {VO_TIMING.map((vo) => (
      <Sequence key={vo.id} from={vo.startF} durationInFrames={vo.endF - vo.startF}>
        <Audio src={staticFile(`audio/vo/${vo.id}.mp3`)} volume={VO_VOLUME} />
      </Sequence>
    ))}

    {/* 10 SFX hits */}
    {SFX_TIMING.map((sfx) => {
      const volume = sfx.file === "sfx_money" ? SFX_MONEY_VOLUME : SFX_VOLUME;
      return (
        <Sequence key={`${sfx.file}-${sfx.f}`} from={sfx.f} durationInFrames={sfx.durF}>
          <Audio src={staticFile(`audio/sfx/${sfx.file}.mp3`)} volume={volume} />
        </Sequence>
      );
    })}
  </>
);
