# HOOK Build Spec — Batch C (beats 1-4)

> **Purpose**: Full visual + audio + subtitle specification for the HOOK section (beats 1-4).
> Source of truth for this batch. CC reads this end-to-end and executes Tasks 1-9 sequentially.
> **Version**: 1.0 · **Created**: 2026-06-03 · **For**: Claude Opus 4.8 in Claude Code

---

## PROJECT LAW — SUBTITLES ALWAYS

Every beat in every batch must render a subtitle, no exceptions:

| Property | Value |
|---|---|
| Font | Inter weight 500, 32px |
| Color | `#FFA500` (CSS pure orange) |
| Pill background | `rgba(8, 12, 20, 0.72)` |
| Pill padding | 20px horizontal, 10px vertical |
| Pill border-radius | 6px |
| Position | absolute, bottom 100px, horizontally centered |
| In animation | 6 frames fade-in (opacity 0→1) + slide-up 8px |
| Out animation | 6 frames fade-out at fromFrame + durationFrames - 6 |
| Sync | subtitle in ≤ VO start +4f, subtitle out ≥ VO end -4f |
| Text source | BEAT_SHEET v3.1 EN column **verbatim** — no abbreviation, paraphrase, or summarization |

**User reviews mp4s by READING SUBTITLES, not listening to audio.** Audio quality is not evaluated this pass. If a beat is missing a subtitle, has incorrect subtitle text, or has subtitle timing off — that beat fails review.

This law applies to all batches: HOOK, ARCHITECTURE, REFUND, CREDIBILITY, IMPL_PROOF, PAYOFF.

---

## ABSOLUTE HARD RAIL — no ElevenLabs API calls

The user has **revoked** the `ELEVENLABS_API_KEY` in `.env` as a safeguard. ANY ElevenLabs API call will fail at auth. This is intentional.

CC must NOT:
- Call `scripts/gen_vo.mjs` (will fail)
- Call the ElevenLabs API directly via curl / fetch / node
- "Regenerate" or "retake" any `vo_b*.mp3`
- Modify `gen_vo.mjs`, `vo_lines.json`, `vo_lines.ts`, or `.env`
- Suggest re-running gen_vo.mjs as a fix

If a VO line is wrong / bad / mistimed → **NOTE in report**, don't act. User decides later whether to restore API key.

The existing 35 `vo_b*.mp3` files in `demo-video/remotion/public/audio/vo/` are **FINAL** for this visual build. Use as-is via `<Audio>` tags.

---

## Decisions pre-approved by user

In response to CC's escalation about Subtitle.tsx conflict:

**A. API mismatch**: Use NEW API shape `<BeatSubtitle text="..." fromFrame={n} durationFrames={n} />`. Legacy `<Subtitle from to>` API is for legacy code only.

**B. Style vs tokens**: ✅ **Create `src/polish/BeatSubtitle.tsx`** — new component, separate from legacy `Subtitle.tsx`. PROJECT LAW values are **hardcoded inside BeatSubtitle.tsx** (32px / `#FFA500` / pill / bottom 100px). Don't touch `polish/tokens.ts` or legacy `Subtitle.tsx`.

**C. Legacy untouched**: Existing `src/polish/Subtitle.tsx` and its imports (`Timeline.tsx`, `audio/SubtitleLayer.tsx`) stay as-is. New beats use BeatSubtitle only.

---

## Task 1 — Apply b29 text trim to BEAT_SHEET (NO AUDIO REGEN)

`demo-video/docs/BEAT_SHEET.md`, CREDIBILITY section, Beat 29:

**Replace** current b29 text with:

```
EN: Some run on auto-send. Best Buy and Target use a chat script today.
中: 有些走自动发送。Best Buy 和 Target 目前走 chat script。
```

**Add a note row** under the CREDIBILITY table:

```
> ⚠ b29 audio is stale — still has the 8.50s long version from the VO batch.
> Plan: surgical retake when ElevenLabs API key is restored. Subtitle uses
> the trimmed text above; audio plays the longer version. Mismatch is
> temporarily acceptable — HOOK visual build does not touch CREDIBILITY visuals.
```

---

## Task 2 — Delete stale Beat compositions

Three existing beats are stale (v0.x content / wrong concepts). Wipe them:

```bash
rm -rf demo-video/remotion/src/beats/b01_hook-question__000-005
rm -rf demo-video/remotion/src/beats/b02_money-types__005-010
rm -rf demo-video/remotion/src/beats/b03_two-percent__010-015
```

Also delete their out/ artifacts:

```bash
rm -f demo-video/remotion/out/shorts/b01_*.mp4
rm -f demo-video/remotion/out/shorts/b02_*.mp4
rm -f demo-video/remotion/out/shorts/b03_*.mp4
rm -rf demo-video/remotion/out/stills/b01
rm -rf demo-video/remotion/out/stills/b02
rm -rf demo-video/remotion/out/stills/b03
```

Update `Root.tsx`: remove old Beat01 / Beat02 / Beat03 imports and `<Composition>` registrations. (They will be re-added when the new components below are built.)

---

## Task 3 — Build shared infrastructure

### 3.A — `src/polish/HookAtmosphere.tsx`

A 4-layer atmosphere wrapper used by all 4 HOOK beats:

| Layer | Purpose | Implementation |
|---|---|---|
| 0 | Solid background | `colors.bg.dark` (= `#080C14`) full-screen `<AbsoluteFill>` |
| 1 | Vignette | Radial gradient, corners ~50% darker than center. Use SVG `<radialGradient>` or CSS radial-gradient |
| 2 | Film grain | Inline SVG `<feTurbulence>` pattern, fixed seed, ~6% opacity. **Frame-shift the pattern by 1 row every 4 frames** (frame-driven via `transform: translateY(${(frame % 4) * 1}px)` or similar) — NOT CSS animation |
| 3 | Scan lines | 1px wide every 4px, ~2% white opacity. Pure CSS background-image of repeating-linear-gradient |

Component signature:
```tsx
export const HookAtmosphere: React.FC<{children: React.ReactNode}> = ({children}) => { ... }
```

All 4 HOOK beats wrap their content in `<HookAtmosphere>`.

### 3.B — `src/polish/BeatSubtitle.tsx`

Universal subtitle component (replaces ad-hoc subtitles for all NEW beats).

Props:
```ts
interface BeatSubtitleProps {
  text: string;
  fromFrame: number;
  durationFrames: number;
}
```

Behavior:
- Return `null` if `frame < fromFrame` or `frame >= fromFrame + durationFrames`
- Fade in: 0→1 opacity + slide-up 8px (`translateY(8px)` → `translateY(0)`) over frames `[fromFrame, fromFrame+6]`
- Hold: full opacity from `fromFrame+6` to `fromFrame+durationFrames-6`
- Fade out: 1→0 opacity over frames `[fromFrame+durationFrames-6, fromFrame+durationFrames]`
- All transitions frame-driven via `interpolate` + `useCurrentFrame`

Styling (hardcode in this component, do NOT pull from tokens.ts):
```tsx
{
  position: 'absolute',
  bottom: 100,
  left: '50%',
  transform: `translateX(-50%) translateY(${slideY}px)`,
  fontFamily: 'Inter, sans-serif',
  fontSize: 32,
  fontWeight: 500,
  color: '#FFA500',
  backgroundColor: 'rgba(8, 12, 20, 0.72)',
  padding: '10px 20px',
  borderRadius: 6,
  whiteSpace: 'nowrap',
  letterSpacing: '-0.005em',
  opacity,
}
```

Use the existing `easings.easeOut` for opacity and translateY interpolation.

---

## Task 4 — Build Beat01 (`b01_hook-cracks__000-005`)

Path: `src/beats/b01_hook-cracks__000-005/Beat01.tsx`

VO: `vo_b01.mp3` (2.83s = 170f) "Every year, money slips through the cracks."

### Frame plan (300f @ 60fps = 5s)

| Frame range | Event |
|---|---|
| 0-5 | `<HookAtmosphere>` only, nothing else |
| 6-12 | Horizontal accent line draws out from screen center to ~600px wide. 1px tall. Color `colors.neutral[300]` at 90% opacity. Use `easings.sharpOut`. Position: vertical at 60% of screen height (= y 648) |
| 12-55 | Text reveals char-by-char typewriter: 1 char/frame for 43 chars. Caret (2px wide × text-height tall, `colors.neutral[0]`) follows last char. Text: `"Every year, money slips through the cracks."` |
| 55-240 | Hold. Caret continues blinking (12f on / 12f off) |
| 240-260 | Line retracts from both ends back to center (18f, `easings.sharpIn`) |
| 260-290 | Text mask-wipe right-to-left (30f, `easings.easeIn`). Caret disappears with last char |
| 290-300 | Atmosphere only |

### Visual specs

- Text font: Inter weight 600, 88px, `letter-spacing: -0.03em`, color `colors.neutral[0]` at opacity 0.94
- Text position: 40px above the accent line (= y 600 baseline)
- Text horizontally centered

### Audio + Subtitle

```tsx
<Sequence from={10}>
  <Audio src={staticFile('audio/vo/vo_b01.mp3')} />
</Sequence>

<BeatSubtitle 
  text="Every year, money slips through the cracks." 
  fromFrame={10} 
  durationFrames={170} 
/>
```

### Composition registration in Root.tsx

```tsx
<Composition
  id="Beat01"
  component={Beat01}
  durationInFrames={300}
  fps={60}
  width={1920}
  height={1080}
/>
```

---

## Task 5 — Build Beat02 (`b02_hook-categories__005-010`)

Path: `src/beats/b02_hook-categories__005-010/Beat02.tsx`

VO: `vo_b02.mp3` (3.90s = 234f) "Refunds. Price protection. Rewards. Rebates."

**🚫 NO EMOJI.** Use Lucide icon SVG paths inline.

### Icons & labels (in order, left-to-right)

| # | Lucide name | Label |
|---|---|---|
| 1 | `Receipt` | "Refunds" |
| 2 | `Tag` | "Price Protection" |
| 3 | `Sparkle` (NOT Star) | "Rewards" |
| 4 | `Mail` | "Rebates" |

Get the actual SVG `<path d="...">` from `lucide-react` source or copy from https://lucide.dev. Icons are 24×24 viewbox with `stroke-width="2"`. Scale to 64×64px in the layout.

### Icon rendering

- Inline `<svg viewBox="0 0 24 24">` with monoline `<path>` 
- Stroke: `colors.neutral[0]` at opacity 0.94
- Animate draw-on via `stroke-dasharray` + `stroke-dashoffset`:
  - Estimate pathLength per icon (Lucide icons typically 80-160 — measure empirically or use a fixed conservative value like 200)
  - At icon's f=0: `strokeDashoffset = pathLength` (line not drawn)
  - At icon's f=14: `strokeDashoffset = 0` (line fully drawn)
  - Use `easings.easeOut`

### Layout

4 columns evenly spaced horizontally, centered vertically. 
- Total width: ~1200px (icons span 80% of canvas width)
- Each column: 64×64 icon, 24px gap, label below
- Label: Inter 28px weight 500, color `colors.neutral[0]` opacity 0.94

### Frame plan (300f)

| Frame range | Event |
|---|---|
| 0-5 | Atmosphere only |
| 6-20 | Icon 1 (Receipt) draws on (14f) + label "Refunds" typewriter-types char-by-char |
| 18-32 | Icon 2 (Tag) draws on + label "Price Protection" types |
| 30-44 | Icon 3 (Sparkle) draws on + label "Rewards" types |
| 42-56 | Icon 4 (Mail) draws on + label "Rebates" types |
| 60-240 | All 4 in place. Subtle breathing: each icon's scale = `1 + Math.sin((frame - 6 - i*22) * 2*Math.PI / 90) * 0.005` |
| 240-280 | Stagger fade-out: each icon-label pair offset 4 frames |
| 280-300 | Atmosphere only |

### Audio + Subtitle

```tsx
<Sequence from={6}>
  <Audio src={staticFile('audio/vo/vo_b02.mp3')} />
</Sequence>

<BeatSubtitle 
  text="Refunds. Price protection. Rewards. Rebates." 
  fromFrame={6} 
  durationFrames={234} 
/>
```

---

## Task 6 — Build Beat03 (`b03_hook-twopercent__010-015`)

Path: `src/beats/b03_hook-twopercent__010-015/Beat03.tsx`

VO: `vo_b03.mp3` (2.69s = 162f) "Only two out of a hundred ever get it back."

**This is THE hero data-viz beat. Worth extra polish.**

### Visual concept

10×10 dot grid (100 dots) center-stage. After build + pause, 2 deterministic dots turn red with halo glow. Caption reinforces the data point.

### Grid math

- 100 dots in a 10×10 arrangement
- Dot diameter: 16px
- Center-to-center spacing: 36px
- Grid total bounding box: `9 × 36 + 16 = 340px` wide × 340px tall
- Grid center position on canvas: `x = 960, y = 460` (slightly above vertical center to leave room for caption below)
- Dot at `(row, col)` is at `(960 - 170 + col*36 + 8, 460 - 170 + row*36 + 8)` (center-of-dot)
- All dots: `colors.neutral[500]` initially (a desaturated mid-gray)

### Deterministic red dot selection

Use Remotion's `random()` for deterministic selection. Both red dots must be in the inner 6×6 area (avoid edges for visual punch):

```ts
import { random } from 'remotion';

const r1 = Math.floor(random("beat3-row1") * 6) + 2; // 2..7
const c1 = Math.floor(random("beat3-col1") * 6) + 2;
let r2 = Math.floor(random("beat3-row2") * 6) + 2;
let c2 = Math.floor(random("beat3-col2") * 6) + 2;

// Avoid collision
if (r1 === r2 && c1 === c2) {
  r2 = (r2 + 2) % 8 + 2;
}
```

### Frame plan (300f)

| Frame range | Event |
|---|---|
| 0-5 | Atmosphere only |
| 6-50 | Grid builds row-by-row, left-to-right. Dot at row `r`, col `c` starts at frame `6 + r*4 + c*2`. Each dot: opacity 0→1 + scale 0→1 over 8 frames, `easings.easeOut` |
| 50-70 | **Pause** — 100 dots solid, holding. **This pause matters** — viewer registers "100 identical things" before the punch |
| 70-85 | 2 red dots scale 1.0→1.4 over 15 frames (`easings.sharpOut`) |
| 80-90 | Red dots color interpolates `colors.neutral[500]` → `colors.semantic.danger` over 10f |
| 85-110 | Halo glow appears behind red dots: a second larger circle (radius 24px) at `colors.semantic.danger` 20% opacity. 12-frame fade-in |
| 95 | VO starts (vo_b03 begins playing) |
| 110-130 | Caption typewriter under grid: `"2 out of 100"`. Position: y = 660 (below grid bottom + 40px gap). Font: Inter 32px weight 500, `colors.neutral[100]` opacity 0.94 |
| 130-270 | Hold. Subtle pulse on red dots: scale 1.4 + `Math.sin((frame-110) * 2*Math.PI / 60) * 0.05` |
| 270-290 | Everything fades out (grid + caption + halos). Red dots fade slightly slower (last to disappear, ~3f offset) |
| 290-300 | Atmosphere only |

### Audio + Subtitle

```tsx
<Sequence from={95}>
  <Audio src={staticFile('audio/vo/vo_b03.mp3')} />
</Sequence>

<BeatSubtitle 
  text="Only two out of a hundred ever get it back." 
  fromFrame={95} 
  durationFrames={162} 
/>
```

Note: The subtitle (bottom 100px, orange pill) and the caption (under grid, white text) coexist. The caption is a chart annotation; the subtitle is the spoken sentence. They reinforce each other.

---

## Task 7 — Build Beat04 (`b04_hook-claimit__015-020`)

Path: `src/beats/b04_hook-claimit__015-020/Beat04.tsx`

VO: `vo_b04.mp3` (3.53s = 212f) "ClaimIt turns that paperwork into an AI workflow."

### Visual concept

Dots from Beat03's grid converge into the ClaimIt logo (narrative continuity — the 100 forgotten people coalesce into the product). For per-shot self-containment, Beat04 re-renders the 100 dots at their grid positions at f=0, then animates convergence.

### Frame plan (300f)

| Frame range | Event |
|---|---|
| 0-5 | 100 dots at full grid positions (re-render the grid from Beat03 — same `(row, col)` math, same `colors.neutral[500]`). 2 dots at the red positions are red. Atmosphere visible |
| 6-35 | Each dot moves from grid position toward center `(960, 540)` with scale 1.0→0.0. Per-dot easing offset: `dotIndex * 0.3` frames so they don't all converge simultaneously (creates a "swarm" effect). Use `easings.easeInOut` |
| 30-55 | ClaimIt wordmark appears at center. Text: `"ClaimIt"` in Inter weight 700, 128px, color `colors.brand.primary` (= #27466E navy from polish/tokens.ts), `letter-spacing: -0.04em`. Animation: `spring({frame: frame-30, fps, config: {damping: 14, stiffness: 120}})` for scale 0.85→1.0 + opacity interp 0→1 |
| 55-260 | Logo holds. Subtle breath: scale `1 + Math.sin((frame-55) * 2*Math.PI / 120) * 0.004` |
| 260-290 | Logo fade-out (opacity 1→0, `easings.easeIn`) |
| 290-300 | Atmosphere only |

### Audio + Subtitle

```tsx
<Sequence from={30}>
  <Audio src={staticFile('audio/vo/vo_b04.mp3')} />
</Sequence>

<BeatSubtitle 
  text="ClaimIt turns that paperwork into an AI workflow." 
  fromFrame={30} 
  durationFrames={212} 
/>
```

---

## Task 8 — Render + stills per beat

For each beat (b01 → b04, in order, with self-review before next):

### Render mp4

```bash
npx remotion render src/index.ts Beat0X out/shorts/b0X_hook-<slug>.mp4 \
  --crf=18 \
  --color-space=bt709 \
  --pixel-format=yuv420p \
  --image-format=png \
  --scale=2 \
  --audio-bitrate=320k \
  --audio-codec=aac
```

(Replace `b0X_hook-<slug>` with `b01_hook-cracks`, `b02_hook-categories`, `b03_hook-twopercent`, `b04_hook-claimit`.)

### Stills (6 per beat)

```bash
mkdir -p out/stills/b0X
npx remotion still src/index.ts Beat0X out/stills/b0X/f000.png --frame=0
npx remotion still src/index.ts Beat0X out/stills/b0X/f060.png --frame=60
npx remotion still src/index.ts Beat0X out/stills/b0X/f120.png --frame=120
npx remotion still src/index.ts Beat0X out/stills/b0X/f180.png --frame=180
npx remotion still src/index.ts Beat0X out/stills/b0X/f240.png --frame=240
npx remotion still src/index.ts Beat0X out/stills/b0X/f299.png --frame=299
```

### Self-check per beat (greps must all return empty)

```bash
grep -rnE "transition:|@keyframes|setTimeout|setInterval|requestAnimation|<img |<video |<audio |Easing\.linear|#[0-9a-fA-F]{3,6}" src/beats/b0X_*/
```

View each PNG and check:
- Visual matches the frame plan above
- Text doesn't overflow / clip / wrap badly
- Color usage matches `polish/tokens.ts` (no hex literals leaked except in BeatSubtitle.tsx where the LAW mandates literal `#FFA500`)
- Stagger visible across the 6 stills (multi-element beats show different states)
- Subtitle pill orange visible and readable on dark bg

If anything fails: fix, re-render, re-review THAT beat. Don't move to next beat until current beat is clean.

---

## Task 9 — Report

Chat report with:

1. **4 mp4 paths** in `out/shorts/`
2. **24 still PNG paths** (6 per beat × 4 beats)
3. **Per beat**: iterations needed before clean self-check passed (0 = first try)
4. **BEAT_SHEET v3.1 ambiguities** you had to interpret (with how you resolved them)
5. **Lucide icon path-lengths** you used (literal value or estimation method)
6. **Beat03 random()-resolved positions** (which 2 dots ended up being the red ones — give `(r1,c1)` and `(r2,c2)`)
7. **Total elapsed time**

Then **STOP**. Do NOT proceed to Batch D (Architecture visuals). User reviews 4 mp4s + stills before greenlighting next batch.

---

## Constraints (re-state)

- **NO ElevenLabs API calls** (hard rail — key revoked)
- **NO modifications to**: `gen_vo.mjs`, `vo_lines.json`, `vo_lines.ts`, `.env`, `vo_b*.mp3` files, `polish/easings.ts`, `polish/tokens.ts`, `load-fonts.ts`, `src/_archive/erdun_shots_v1/`, `src/polish/Subtitle.tsx` (legacy)
- **Allowed to modify**: `demo-video/docs/BEAT_SHEET.md` (Task 1 b29 edit only), `Root.tsx` (Composition registrations), all NEW files under `src/beats/b0X_*/` and `src/polish/BeatSubtitle.tsx` + `src/polish/HookAtmosphere.tsx`
- All animations must be `useCurrentFrame`-driven; no CSS transitions/keyframes; no setTimeout
- `<Img>` not `<img>`, `<Audio>` not `<audio>`
- All colors from `polish/tokens.ts` EXCEPT inside `BeatSubtitle.tsx` (where LAW mandates literal `#FFA500`)
- All easings from `polish/easings.ts`
- Inter font only (already loaded via `load-fonts.ts`)
- **No commits**
