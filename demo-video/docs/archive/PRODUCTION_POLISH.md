# ClaimIt Demo Video — Production Polish System

The eight-pillar system that makes the film feel cinematic instead of clean-but-cheap. Every section passes through this. Every pillar is implemented as a reusable Remotion component or helper so polish is applied by composition, not by hand.

Version 1.0 — 2026-05-31. Locked for first render.

---

## Why this document exists

A demo can be technically correct and look like a student project. The difference between "student project" and "world-class" is not features — it's the *texture* of every frame: how light falls, how cards float, how the camera breathes, how grain sits over color. Those eight texture decisions are written once below, implemented once in `src/polish/`, and applied to every section automatically.

When a section doesn't feel right, the fix is almost always to crank up a pillar that was applied too lightly. Don't add new ornamentation — increase the existing system.

---

## Pillar 1 — LIGHT

**Goal.** Things that matter glow. Things that don't, recede.

### Implementations

| Component | Where it's applied |
|---|---|
| `<Bloom>` (CSS `filter: drop-shadow` stack — 3 layers) | refund-money green ($50), Approve button, price-drop banner, "Submitted" status pill |
| `<RimLight>` (1px inset white at 8% opacity + 24px outer glow at 4%) | every card, every modal, every claim pane edge |
| `<LightBeam>` (radial gradient, 0–35% opacity, off-canvas falloff) | opening (Section ①), Section ⑤ Cut transition, Section ⑧ Close |

### Concrete values

- Bloom: `drop-shadow(0 0 8px var(--accent))` + `drop-shadow(0 0 24px var(--accent) / 0.5)` + `drop-shadow(0 0 56px var(--accent) / 0.2)` — three stacked shadows is the bloom recipe.
- Rim light: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 24px rgba(255,255,255,0.04)` on every card. Subtle. Reads as "this thing is a real physical surface."
- Light beam: `background: radial-gradient(ellipse 800px 1200px at 50% 0%, rgba(255,255,250,0.22), transparent 60%)` — adjustable origin per shot.

### Anti-patterns

Never use Tailwind's `shadow-2xl` for "premium." It's a flat 25px shadow that screams "default Tailwind." Always stack three shadows manually with different blur and opacity (see Pillar 2).

---

## Pillar 2 — DEPTH

**Goal.** Cards float in space, they don't stick to the page.

### Implementations

| Component | Where it's applied |
|---|---|
| `<Lift>` (3-layer stacked shadow + 1–4px y-translate) | every floating card, the closing card, every modal |
| `<RackFocus>` (CSS `filter: blur(8px) saturate(0.5)` on background, sharp on foreground) | Section 6.1 (Gmail inbox emails), Section 6.6 (left pane during assistant zoom) |
| `<Parallax>` (multi-layer divs with different translate-rates over frame) | Sections ② and ③ floating supporting elements, Section ① particles |
| `<ZLift>` (scale 1.02 + 16px y-translate on focus) | claim panes during section 6.5 highlights, cards during stagger entrances |

### Concrete shadow stack (THE difference between cheap and premium)

```css
/* For every floating card. Never a single shadow. */
box-shadow:
  0  2px  4px  rgba(15, 23, 42, 0.04),   /* ambient — tight, near */
  0  8px  16px rgba(15, 23, 42, 0.06),   /* mid — separation */
  0  24px 48px rgba(15, 23, 42, 0.08);   /* hero — drop */
```

Optional 4th layer for hero cards: `0 56px 96px rgba(15, 23, 42, 0.04)` — the "vast" shadow.

### Rack focus formula

```
foreground:  filter: none;            opacity: 1;
mid-ground:  filter: blur(2px);       opacity: 0.92; saturation: 0.85;
background:  filter: blur(8px);       opacity: 0.7;  saturation: 0.55;
```

Animate the `filter blur` value with Remotion's `interpolate` (60ms ramp) to rack between planes. Saturation drop sells the focus the same way DSLR depth-of-field does.

### Parallax rates

- foreground: 1.0× frame motion
- mid: 0.6×
- background: 0.3×
- deep background: 0.1×

Every layer moves slower than the one in front of it. Even a few-pixel offset across 30 frames reads as depth.

---

## Pillar 3 — MATERIAL

**Goal.** Surfaces have texture. Nothing is plastic.

### Implementations

| Component | Where it's applied |
|---|---|
| `<FrostedGlass>` (`backdrop-filter: blur(20px) saturate(1.2)` + 8% white overlay) | overlays, modals, the Submitted toast, dialog backdrops |
| `<Grain>` (SVG turbulence noise, 6% opacity, mix-blend overlay) | **EVERY FRAME** — applied at root of every composition |
| `<Gradient>` (soft 2-stop gradient instead of flat fill) | hero backgrounds in ②③④⑤⑧ |

### Grain — THE single most important polish element

The film grain layer is critical. It kills the "too clean digital" look that makes web video feel cheap. It is what makes 4K Netflix look like 35mm.

Implementation: a fixed-position SVG turbulence filter mixed at 6% opacity over the entire frame. Renders deterministically per frame via Remotion's frame number as a seed.

```tsx
<svg style={{position:'absolute', inset:0, pointerEvents:'none', mixBlendMode:'overlay', opacity:0.06}}>
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame}/>
    <feColorMatrix values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0   0 0 0 1 0"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>
```

Grain on light backgrounds: 4–6% opacity. Grain on dark backgrounds: 6–9% opacity (dark fields need more texture to feel material).

### Frosted glass

Frosted-glass overlays use `backdrop-filter: blur(20px) saturate(1.2)` with an 8% white film on top. The saturation boost is what makes it feel like real frosted glass instead of CSS blur.

### Soft gradients instead of flat fills

Hero backgrounds use a 2-stop linear gradient where stops are within 5% of each other — barely perceptible, but it kills the dead-flat-color look. Example for warm white hero:
```css
background: linear-gradient(180deg, #F5F5F0 0%, #EFEFE9 100%);
```

---

## Pillar 4 — CAMERA

**Goal.** Nothing is ever 100% static. The camera is always alive.

### Implementations

| Component | Where it's applied |
|---|---|
| `<CameraMove>` (translate/scale/rotate over frames, easing curve) | section transitions, hero entrances |
| `<Breathe>` (continuous 4% scale wobble + ±2px y drift, ~6s period) | **wraps every section root**, applied implicitly |
| `<RackFocusBetween>` (rack from plane A to plane B at frame X) | 6.1 (focus pull to new email), 6.6 (focus pull to Assistant pane) |
| `<SpeedRamp>` (slow-in → fast → slow-out interpolation for transitions) | shader transitions in ⑤ and 6.5 |

### Breathe — the directly-fixes-"static" wrapper

```tsx
const Breathe: React.FC<{children: ReactNode; intensity?: number}> = ({children, intensity = 1}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const scale = 1 + Math.sin(t * 1.05) * 0.005 * intensity;
  const ty    =    Math.sin(t * 0.7 + 1.2) * 1.5 * intensity;
  return <div style={{transform:`translateY(${ty}px) scale(${scale})`, transformOrigin:'center'}}>{children}</div>;
};
```

Wrapped around every section root. Default `intensity = 1` (near-imperceptible). For sections that want explicit motion (hero typography), boost to 1.5–2.

The "10 seconds nothing happened" problem cannot exist if Breathe is on.

### Camera move easing

Push-ins use `[0.34, 1.56, 0.64, 1]` (anticipation + slight overshoot) for hero moments and `[0.16, 1, 0.3, 1]` (the smooth-as-glass curve) for transitions. Never linear.

### Speed-ramped transitions

Most transitions feel cheap because they're linear. Real cinematic transitions slow-in, accelerate at mid-point, slow-out. Implement with `interpolate(progress, [0, 0.5, 1], [0, 0.85, 1])` — the mid-point lift is the speed ramp.

---

## Pillar 5 — MOTION CRAFT

**Goal.** Every element arrives with weight. Nothing snaps. Nothing linears.

### Implementations

| Helper | What it does |
|---|---|
| `springEntrance(frame, opts)` | Remotion `spring()` config (`damping: 16, mass: 1, stiffness: 110`) — replaces every `fadeIn` |
| `stagger(index, perItem, total)` | Returns the frame offset for the Nth item — applied to every list, grid, or sequence |
| `<MotionBlur>` (wraps @remotion/motion-blur) | applied to fast-moving elements (cursor in 6.5, scroll marquee in ⑦, opening particles) |
| `anticipation(frame, peakFrame, pullback)` | tiny scale-down before big-move scale-up — gives weight to anything that pops |

### Spring config baseline

```ts
const SPRING = { damping: 16, mass: 1, stiffness: 110 };
```

This gives a slight overshoot + settle. Calibrated to feel like the system has mass.

### Motion blur cost

@remotion/motion-blur multiplies render time by the `samples` value. Use sparingly — only on elements where you'd actually see the smear. Default samples: 8. Drop to 4 for marquees, raise to 12 for the opening particle collapse.

### Anticipation pattern

```ts
// Big pop at frame 30. Tiny pull-back at frame 24.
const s = interpolate(
  frame,
  [0, 24, 30],
  [1, 0.97, 1.06],
  {easing: Easing.bezier(0.4, 0, 0.6, 1)}
);
```

Don't overuse — anticipation is for moments the audience should feel are *significant* (Approve button click, final reveal of $50 back, opening receipt materialization).

### Stagger everything

Lists never enter all at once. Cards never enter all at once. The 4-type cards in 6.4: stagger 100ms each. The 26 logos in ⑦: stagger 30ms each (faster because there are more of them — total time should land at ~700ms). The closing tech list in ⑧: stagger 80ms.

---

## Pillar 6 — TRANSITIONS

**Goal.** Hard cuts are deliberate. Everything else uses a transition built into the visual language.

### Implementations

| Transition type | Where |
|---|---|
| Hard cut | ① → ②, 6.3 → 6.4, ⑦ → ⑧ — the three cuts that "speak" |
| Light flash | ⑤ Cut → 6.1 (white expanding from center) |
| Liquid wipe | 6.4 → 6.5, 6.5 → 6.6 (the "settling into product" moments) |
| Match cut | 6.6 → 6.7 (Assistant pane → claim header — same focal area) |
| Soft crossfade | ⑦ → ⑧ (the "exhale" into close) |

Uses `@remotion/transitions` (`<TransitionSeries>` + presets `fade`, `wipe`, `slide`, custom) plus custom shader-style React transitions.

### Light-flash recipe

```tsx
// Brief overexposed white expanding from center, 24-frame total
const lightFlash = ({progress}) => {
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 1, 0]);
  const scale   = interpolate(progress, [0, 1],     [0, 4]);
  return <div style={{
    position:'absolute', inset:0, pointerEvents:'none',
    background:'radial-gradient(circle, #fff 0%, transparent 60%)',
    opacity, transform:`scale(${scale})`, mixBlendMode:'screen',
  }}/>;
};
```

---

## Pillar 7 — COLOR GRADE

**Goal.** Every section feels like it came from the same camera.

### Implementations

| Component | What it does |
|---|---|
| `<Grade>` | Wraps every composition root. Applies a single CSS filter stack and a soft vignette. |

### The grade

```css
filter:
  saturate(1.08)        /* +8% saturation pop */
  contrast(1.04)        /* gentle S-curve feel */
  brightness(0.98)      /* tiny pull-down to match cinema gamma */
  hue-rotate(-2deg);    /* very subtle warmth (more amber, less cyan) */
```

Plus a soft inset vignette via a fixed overlay:

```tsx
<div style={{
  position:'absolute', inset:0, pointerEvents:'none',
  background:'radial-gradient(ellipse 1400px 900px at center, transparent 55%, rgba(0,0,0,0.18) 100%)',
}}/>
```

The vignette pulls the eye to center. Cinema does this with a literal lens vignette; we do it with CSS.

### Section overrides

Sections that need lift (⑦ Reach grid, ⑧ Close resolution) can override the brightness to `1.02`. Sections that need quiet (② Hook, ① Opening) can drop saturation to `0.95`.

The grade is the LAST wrapper in every composition tree — after Breathe, after Grain, after content.

---

## Pillar 8 — SOUND CUE MAP

**Goal.** Document every audio event precisely so the Phase 4 mix is a transcription, not a creative session.

> **Not implemented in render-time code.** This is a *spec for the Phase 4 voice/stitch step* — when the user unblocks Phase 4, this map drives the audio mixer.

### Music bed (one piece, dynamic levels)

| Section | dB | Character |
|---|---|---|
| ① Opening | -28 | single sustained tone, slow heartbeat pulse |
| ② Hook | silent | drops out completely |
| ③ Why | -24 | single held note, no rhythm |
| ④ Scale | -22 | held note drifts down a third |
| ⑤ Cut | -20 | warm pad swells |
| ⑥ Demo | -20 | warm pad sustained through 85s |
| ⑦ Reach | -18 | pad fills out, suggests resolution |
| ⑧ Close | -22 → 0 | pad resolves to major chord, fades |

### Sound design cues

| Time | Cue | Sound spec | Volume |
|---|---|---|---|
| 0:00.000 | Music starts | sustained tone fades in | -28 dB |
| 0:02.500 | Particles begin gathering | ambient rustle peaks | -32 dB |
| 0:05.800 | Receipt materializes | paper rustle, 200ms | -22 dB |
| 0:06.000 | Hook begins | music drops to silence | — |
| 0:23.000 | Why begins | music re-enters | -24 dB |
| 0:52.000 | Cut transition | cinematic whoosh, 600ms | -20 dB |
| 0:57.500 | New email arrives | soft chime ~660Hz, 200ms | -28 dB |
| 1:14.300 | Price drop detected | soft chime ~440Hz, 300ms | -22 dB |
| 1:24.000 | Hard cut to black | brief soft pop, transient | -32 dB |
| 1:33.000 | Three cards depart | subtle UI whoosh | -30 dB |
| 1:34.000 | Email card lands | tiny tonal cue | -28 dB |
| 1:36.000 | Liquid wipe to three-pane | subtle whoosh | -28 dB |
| 1:36.600 | UI settle | barely-audible click | -36 dB |
| 1:46.000 | Assistant chat opens | soft chime ~660Hz, 200ms | -25 dB |
| 1:48.500–1:51.000 | User typing | faint typing bed | -36 dB |
| 1:51.500–1:58.500 | Streaming response | barely-audible tick texture | -42 dB |
| 1:59.500 | Left-pane highlight | single soft synth note | -28 dB |
| 2:04.000 | Approve clicked | keyboard tap | -22 dB |
| 2:13.000 | Email sent confirmation | tonal ding ~880Hz, 400ms | -22 dB |
| 2:16.500 | Closing card enters | subtle UI whoosh | -30 dB |
| 2:32.000 | Logo grid pulse | soft synth pulse | -24 dB |
| 2:35.000 | Close section opens | pad resolves | — |
| 2:38.800 | Closing line cue | soft chime ~660Hz, 300ms | -22 dB |
| 2:46.000–2:48.000 | Fade to silence | music tail ends | -∞ |

### Voiceover

ElevenLabs `Paige — Engaging Narrator`, model `Eleven v3`. One file per section, normalized to -16 LUFS. Master mix sits VO at -3 dB peak above music bed.

---

## Component library inventory

The polish is implemented in `src/polish/`. Every section imports what it needs. Defaults stack: every composition wraps in `<Grade><Breathe><Grain>...content</Grain></Breathe></Grade>`.

| File | Exports | Pillar |
|---|---|---|
| `polish/Grade.tsx` | `<Grade>` (color grade + vignette) | 7 |
| `polish/Grain.tsx` | `<Grain>` (film grain overlay) | 3 |
| `polish/Breathe.tsx` | `<Breathe>` (perpetual micro-motion) | 4 |
| `polish/Bloom.tsx` | `<Bloom>` (3-layer drop-shadow glow) | 1 |
| `polish/RimLight.tsx` | `<RimLight>` (card edge highlight) | 1 |
| `polish/LightBeam.tsx` | `<LightBeam>` (volumetric beam) | 1 |
| `polish/Lift.tsx` | `<Lift>` (multi-shadow card lift) | 2 |
| `polish/RackFocus.tsx` | `<RackFocus>`, `useRackFocus()` | 2, 4 |
| `polish/Parallax.tsx` | `<Parallax>` (multi-layer slow-drift) | 2 |
| `polish/FrostedGlass.tsx` | `<FrostedGlass>` (backdrop blur + film) | 3 |
| `polish/CameraMove.tsx` | `<CameraMove>`, `useCameraMove()` | 4 |
| `polish/MotionBlur.tsx` | `<MotionBlur>` (wraps @remotion/motion-blur) | 5 |
| `polish/Subtitle.tsx` | `<Subtitle>` (lower-third burned-in caption) | — |
| `polish/motion.ts` | `springEntrance()`, `stagger()`, `anticipation()`, `EASING` presets | 5 |
| `polish/tokens.ts` | every color, font-size, weight from FRONTEND_RECON.md | — |

---

## Application pattern

Every section composition looks like this:

```tsx
import { Grade, Breathe, Grain } from "@/polish";
import { Subtitle } from "@/polish/Subtitle";

export const SectionXX = () => {
  return (
    <Grade>
      <Breathe intensity={1}>
        {/* section-specific content here */}
        <Subtitle from={45} duration={120}>The visible line.</Subtitle>
      </Breathe>
      <Grain />
    </Grade>
  );
};
```

Order is enforced: Grade outermost (wraps everything including grain), Breathe inside (so the grain texture itself doesn't breathe), Grain at the same level as content (so it sits over the breathing surface), Subtitle inside Breathe (so it breathes with the frame).

If a section feels cheap, *increase a pillar*. Don't add an ornament that doesn't already exist in the system.

---

## Changelog

```
v1.0 — 2026-05-31 — Initial spec for the production polish system.
```
