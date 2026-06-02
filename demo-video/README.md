# ClaimIt — Demo Video

The 3-minute product film for ClaimIt (Google Cloud Rapid Agent Hackathon, MongoDB track), built entirely in Remotion — code-driven and deterministic. Tagline: "Your Money, Still Yours."

This folder holds the **script, storyboard, and finished film**. It's modular: every shot and every audio cue is an independent piece you can change without touching the rest. `apps/web/` (the real product app) is never modified — the film reuses its components read-only via shims.

## Read the script & storyboard
- `docs/SHOT_SPEC.md` — authoritative shot-by-shot spec the renderer follows (timecodes, colors, type, motion).
- `docs/SCRIPT.md` — the voiceover narration, line by line.
- `docs/STORYBOARD.md` — per-second visual intent (companion to the spec).
- `docs/REPLICATION_SPEC.md` — the apps/web UI tokens reused inside the film.
- `docs/archive/` — historical / superseded notes (not authoritative).

## Structure (remotion/src/)
- `shots/shot-NN-name/` — one folder per shot (18 shots).
- `acts/` — sequences the shots into the full film (`Timeline.tsx` = the `ClaimItFilm` composition).
- `audio/` — `AudioMix.tsx` (VO + music + SFX), `SubtitleLayer.tsx`, `timing.ts` (all cue timings).
- `shots/_shared/` — tokens, durations, Stage, Camera, scenes (shared design system).
- `polish/` — polish primitives (grain, rack-focus, …).
- `shims/` — build-time interceptors for reusing apps/web components read-only.

## Run
```
cd demo-video/remotion
pnpm install
pnpm exec remotion studio          # live preview
pnpm exec remotion render src/index.ts ClaimItFilm out/claimit-final.mp4 --codec=h264 --crf=14 --gl=angle
```

## Audio
VO, music bed, and SFX live in `public/audio/{vo,sfx,music}/` (committed — render with sound immediately). Generated via `scripts/gen_*.mjs` using ElevenLabs (needs `ELEVENLABS_API_KEY` in `.env`, which is **not** committed). Music/VO aren't deterministically reproducible, so the committed files are the canonical takes.

## Want to change one part?
- A shot's visuals → `src/shots/shot-NN-*/ShotNN.tsx`
- Audio / subtitle timing → `src/audio/timing.ts`
- A VO line → edit `docs/SCRIPT.md`, re-run `scripts/gen_vo.mjs`, drop the new mp3 in `public/audio/vo/`
- The music → re-run `scripts/gen_music_bed.mjs` (new take) or swap the file in `public/audio/music/`

## The rendered video
The final mp4 isn't in git (too large) — ask Erdun for the latest cut, or render it with the command above.
