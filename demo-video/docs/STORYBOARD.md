> Note: `SHOT_SPEC.md` is the authoritative spec the renderer follows. This storyboard captures per-second visual intent — individual details here may have been superseded by SHOT_SPEC.

# ClaimIt Demo Video — Storyboard

The visual and motion specification for every frame of the film. Built to be read alongside `SCRIPT.md` — every voiceover line below references its timecode in the script. Together the two documents form the canonical brief for `compositions/*.html`.

If a decision is not in this document, it has not been made. If a decision in this document is wrong, update the document. Do not work against it.

---

## Document conventions

**Version.** 1.0. Locked for first render. Revisions append to the changelog at the bottom.

**Render target.** 1920×1080, 60fps, MP4 (H.264, AAC). Vertical 9:16 variant cut from the same compositions in a later pass — not part of the v1.0 deliverable.

**Coordinate system.** Origin is top-left. Positions are in pixels at 1920×1080. Translate to other resolutions by ratio.

**Timing.** All timings in seconds, three decimal places. `0:06.000` reads as "six seconds, zero milliseconds." Lengths are exact targets at render time; preview will jitter ±50ms.

**Easing.** All easings reference GSAP's standard catalog. Custom cubic-beziers are written out explicitly. No defaulting.

**Captures.** Real ClaimIt UI is recorded with `npx hyperframes capture <url>` against the deployed beta at `https://claimit-beta.vercel.app` (assumption — confirm exact URL during production). Captures are saved to `captures/<section>.mp4` and composited into HTML via `<video>`. Pages that don't exist (e.g. Gmail inbox) are mocked as HTML.

---

## Visual system

The film is a single visual world. Every shot must look like it was made by the same hand. The system below is the source.

### Palette

The film operates on a near-monochrome base. Color appears rarely and always intentionally — it is a punctuation mark, not a decoration.

| Role                    | Hex       | Used in                                       |
|-------------------------|-----------|-----------------------------------------------|
| Deep black (primary)    | `#000000` | ① Opening, ⑤ Cut, ⑧ Close                     |
| Soft black              | `#0A0A0A` | ④ Scale numbers background                    |
| Warm white (primary)    | `#F5F5F0` | ② Hook, ③ Why, ⑦ Reach grid                   |
| Pure white              | `#FFFFFF` | Demo UI captures (matches ClaimIt FE)         |
| Off-white text on dark  | `#FAFAFA` | All dark-background body text                 |
| Mid gray (citations)    | `#707070` | Source attributions, captions                 |
| Subtle line on dark     | `#1F1F1F` | Dividers, hairlines on black                  |
| Subtle line on light    | `#E5E5E0` | Dividers, hairlines on warm white             |
| Money green             | `#2D6A4F` | Refund amounts, approval confirmations        |
| Soft red                | `#C73E3A` | Price drop indicators, deadline urgency       |
| Best Buy yellow         | `#FFE000` | Only when Best Buy is named on screen         |
| Gmail-inbox blue        | `#1A73E8` | New email highlight, inbound notification     |
| Quiet blue              | `#0F4C75` | Assistant chat, system events                 |

Never use more than one accent color per shot. The monochrome base does the work.

### Typography

The film uses three typefaces. All three load via `@fontsource` and are bundled by HyperFrames at render time.

| Face             | Source                     | Used for                                         |
|------------------|----------------------------|--------------------------------------------------|
| Inter Display    | `@fontsource/inter`        | All hero and statement text                      |
| Inter            | `@fontsource/inter`        | Body, captions, in-demo labels                   |
| JetBrains Mono   | `@fontsource/jetbrains-mono` | Event names, technical credits, code-style text |

Type scale at 1920×1080:

| Level       | Size     | Line height | Letter-spacing | Weight | Used in                            |
|-------------|----------|-------------|----------------|--------|------------------------------------|
| Hero        | 112px    | 1.04        | -0.022em       | 600    | ② Hook lines, ⑧ closing lines     |
| Number      | 168px    | 1.0         | -0.03em        | 700    | ④ Scale ("12%", "$10B+")          |
| Statement   | 72px     | 1.12        | -0.015em       | 500    | ③ Why lines, ⑦ Reach hero line    |
| Sub-hero    | 56px     | 1.15        | -0.012em       | 500    | Section pivots, product name      |
| Body large  | 36px     | 1.35        | -0.005em       | 500    | In-demo labels, dashboard text    |
| Body        | 28px     | 1.4         | -0.003em       | 400    | In-demo secondary text            |
| Caption     | 20px     | 1.3         | 0              | 400    | Source citations, timestamps      |
| Mono        | 24px     | 1.3         | 0              | 500    | Event names, agent IDs            |
| Sub-caption | 16px     | 1.3         | 0.01em         | 500    | End-card credits (Team Sabis etc.) |

Subtitles always use **Inter Display, 36px, weight 500, letter-spacing -0.005em**, white at 95% opacity on dark / black at 95% opacity on light. Positioned center, lower-third at `y = 880px`. No background plate — the type sits directly on the frame.

### Motion principles

Three rules govern every animation in the film.

**Rule 1 — Hold longer than feels right.** Most amateur motion design moves too fast. The default duration for any entrance is 0.6s. The default hold before exit is at least 2 seconds. When in doubt, hold longer.

**Rule 2 — One thing moves at a time.** When the typography is moving, the background is still. When the background is moving, the typography is still. The viewer's eye is never asked to track two motions at once except in deliberate moments (Section ⑥ chat exchange).

**Rule 3 — Easing is the soul.** No linear easings except for continuous scrolls and marquees. Every entrance uses `expo.out` (snappy arrival) or `power3.out` (slightly softer). Every exit uses `expo.in` or `power2.in`. Emphasis moments — and only emphasis moments — get `back.out(1.4)` for a tiny overshoot.

Default durations:

| Action                       | Duration | Easing              |
|------------------------------|----------|---------------------|
| Text fade in                 | 0.6s     | `expo.out`          |
| Text fade out                | 0.4s     | `expo.in`           |
| Element scale + fade in      | 0.8s     | `power3.out`        |
| Section shader transition    | 0.6s     | (shader-controlled) |
| Camera dolly                 | 1.2s     | `power2.inOut`      |
| Number count-up              | 1.2s     | `power3.out`        |
| Emphasis bounce / pop        | 0.5s     | `back.out(1.4)`     |
| Sustained hold (no movement) | min 1.5s | —                   |

### Sound system

One continuous music bed runs across the full 2:48. Specified by section, mixed during post.

| Section          | Music level | Music character                       | Sound design                              |
|------------------|-------------|---------------------------------------|-------------------------------------------|
| ① Opening        | -28 dB      | Single sustained tone, slow pulse     | Ambient rustle (particle motion)          |
| ② Hook           | silent      | none                                  | none                                      |
| ③ Why            | -24 dB      | Single held note, no rhythm           | Faint room tone                           |
| ④ Scale          | -22 dB      | Held note continues                   | Subtle paper-turn sfx between numbers     |
| ⑤ Cut            | -20 dB      | Warm pad swells in                    | Cinematic whoosh on shader cut            |
| ⑥ Demo           | -20 dB      | Warm pad sustained                    | UI clicks, chimes, keyboard taps as cued  |
| ⑦ Reach          | -18 dB      | Pad fills out, suggests resolution    | Soft pulse on grid highlight              |
| ⑧ Close          | -22 → 0 dB  | Pad resolves to major chord, fades    | Single soft chime on closing line         |

Sound design cue list (precise timings):

| Time     | Event                           | Sound                                |
|----------|---------------------------------|--------------------------------------|
| 0:00.000 | Music starts                    | Sustained tone fades in              |
| 0:02.500 | Particles begin to gather       | Ambient rustle peaks                 |
| 0:05.800 | Receipt materializes            | Soft paper rustle                    |
| 0:06.000 | Hook begins                     | Music drops to silence               |
| 0:23.000 | Why begins                      | Music re-enters at -24 dB            |
| 0:52.000 | Cut transition                  | Cinematic whoosh, 0.6s               |
| 1:14.300 | Price drop detected             | Soft single chime (~440Hz)           |
| 1:46.000 | Assistant chat opens            | Soft single chime (~660Hz)           |
| 2:02.500 | Approve button clicked          | Single soft keyboard tap             |
| 2:13.000 | Email sent confirmation         | Tonal ding (~880Hz)                  |
| 2:35.000 | Close section opens             | Pad resolves                         |
| 2:48.000 | Fade to black                   | Music tail ends, full silence        |

---

## Composition file structure

The film is rendered from eight sub-compositions, plus the root timeline:

```
demo-video/
├── index.html                          ← root composition, timeline entry
├── compositions/
│   ├── 01-opening.html                 ← Section ①, particles → receipt
│   ├── 02-hook.html                    ← Section ②, four-line hook
│   ├── 03-why.html                     ← Section ③, three observations
│   ├── 04-scale.html                   ← Section ④, the two numbers
│   ├── 05-cut.html                     ← Section ⑤, product name + Gmail enter
│   ├── 06-demo/
│   │   ├── 06-demo.html                ← Demo wrapper / timeline
│   │   ├── 6-1-inbox-to-dashboard.html
│   │   ├── 6-2-extraction.html
│   │   ├── 6-3-the-drop.html
│   │   ├── 6-4-four-types.html
│   │   ├── 6-5-three-pane.html
│   │   ├── 6-6-assistant.html
│   │   └── 6-7-approve.html
│   ├── 07-reach.html                   ← Section ⑦, breadth wall
│   └── 08-close.html                   ← Section ⑧, tech card + closing line
├── audio/
│   ├── vo/                             ← ElevenLabs VO files (Paige, per-section)
│   ├── music/                          ← single bed file + dynamic stems
│   └── sfx/                            ← chimes, whooshes, keyboard tap
└── captures/
    ├── 6-2-confirm-page.mp4
    ├── 6-3-purchase-detail.mp4
    ├── 6-5-three-pane.mp4
    ├── 6-6-assistant-pane.mp4
    ├── 6-7-approve-flow.mp4
    └── 7-dashboard-grid.mp4
```

Section ⑥ is split into sub-compositions because it carries 85 seconds with seven distinct beats. The wrapper composition (`06-demo.html`) imports the seven sub-files and stitches them on a continuous timeline. Each sub-file owns its own beat — they are not free-floating fragments.

---

## Asset register

Before any composition is written, these assets must exist:

### Fonts (load via `@fontsource`, bundled by HyperFrames at render)

- `@fontsource/inter` — weights 400, 500, 600, 700
- `@fontsource/inter` (Display variant) — weights 500, 600, 700
- `@fontsource/jetbrains-mono` — weight 500

### Music

One file, written or licensed. **Brief for composer or library search:**

A warm, sustained synth pad. Tonal center C minor moving to E♭ major. No percussion. No melody. Single notes held for 8–12 seconds at a time, occasionally drifting through a chord change. Total length: 2:50, with a clear resolution in the final 8 seconds. Reference: the opening of Hans Zimmer's *Time*, but a third as loud and without the build.

Stored at `audio/music/main-bed.mp3`. A second stem with the chord progression at -6 dB louder lives at `audio/music/main-bed-loud-stem.mp3` for the close.

### Sound effects

Single-shot SFX, each as its own file:

| File                          | Source                                | Use            |
|-------------------------------|---------------------------------------|----------------|
| `ambient-rustle.mp3`          | Pixabay (free-license)                | ① Opening      |
| `paper-rustle.mp3`            | Pixabay                               | ① 0:05.8       |
| `cinematic-whoosh.mp3`        | Pixabay or Splice (free tier)         | ⑤ 0:52.0       |
| `chime-low.mp3` (~440Hz)      | Custom (Audacity tone generator)      | ⑥ 1:14.3       |
| `chime-mid.mp3` (~660Hz)      | Custom (Audacity tone generator)      | ⑥ 1:46.0       |
| `keyboard-tap.mp3`            | Pixabay                               | ⑥ 2:02.5       |
| `ding-success.mp3` (~880Hz)   | Custom (Audacity tone generator)      | ⑥ 2:13.0       |
| `paper-turn.mp3`              | Pixabay                               | ④ 0:45.0       |

### Voice files

Generated via ElevenLabs (`Paige - Engaging Narrator`, model `Eleven v3`). One file per section, named `audio/vo/<section>-paige-v1.mp3`. Stability and similarity settings to be tuned during voice review — see SCRIPT.md production notes.

### Capture targets

Real ClaimIt UI recorded with `npx hyperframes capture` from the deployed beta:

| File                                | URL pattern                                    | Duration |
|-------------------------------------|------------------------------------------------|----------|
| `captures/6-2-confirm-page.mp4`     | `/confirm/<seeded-purchase-id>`                | 8s       |
| `captures/6-3-purchase-detail.mp4`  | `/purchases/<seeded-id>` (price chart visible) | 10s      |
| `captures/6-5-three-pane.mp4`       | `/claims/<seeded-claim-id>`                    | 10s      |
| `captures/6-6-assistant-pane.mp4`   | `/claims/<seeded-claim-id>` zoomed to right    | 16s      |
| `captures/6-7-approve-flow.mp4`     | `/claims/<seeded-claim-id>` → Approve click    | 19s      |
| `captures/7-dashboard-grid.mp4`     | `/dashboard` (26-logo wall visible)            | 14s      |

The seeded IDs come from `scripts/qa_reset.sh` in the main repo. Run it before recording captures to guarantee deterministic state. The specific seeded purchase used in this demo is the **AirPods Pro receipt at $199 with a $50 drop** — confirm with the main repo team that this fixture is present and active before capturing.

The Gmail inbox in Section 6.1 is **not** captured. It is built as HTML inside the composition because real Gmail can't be reliably screen-recorded with a controlled new-email arrival.

---

## ① Opening — 0:00.000 to 0:06.000 (6.000s)

The first six seconds of the film. No voice. We earn the audience's attention with motion and sound alone.

**File:** `compositions/01-opening.html`

**Background.** Pure black `#000000`, edge-to-edge. No vignette, no gradient.

**Music.** Single sustained tone, fades in from silence over 0:00.000–0:02.000, holds through to 0:05.999. Music note: C2 sine wave with a subtle low-pass filter.

### Beat 1 — Particle emergence (0:00.000 to 0:02.500)

A Three.js scene initializes. **6,000 particles** distributed randomly across a 3D volume of `[-800, -450, -400]` to `[+800, +450, +400]` world units. The virtual camera sits at `(0, 0, +900)` looking toward origin, with a 45° field of view.

Each particle is a small sphere geometry, radius 0.6 world units. Material: `MeshBasicMaterial` with color `#FAFAFA` and additive blending. Bloom post-processing pass applied to the renderer at intensity 0.6, threshold 0.3.

Particles begin at opacity 0. Between 0:00.000 and 0:01.500, opacity ramps to 0.7 over a per-particle stagger of `gsap.utils.random(0, 1.5)` seconds, easing `power2.out`. Each particle is given a slow random drift velocity in world space — magnitude 8–24 units per second, direction random.

The camera holds still. The audio is silence except for the slowly rising music tone and the ambient rustle entering at 0:01.000.

**The mood here is space, not data.** Particles should feel like specks of light in a dark room, not a corporate "network" graphic. If anything reads as "tech" or "blockchain" or "Big Data," the look is wrong.

### Beat 2 — Convergence (0:02.500 to 0:04.800)

At 0:02.500, particles begin to gather toward a single point at world origin `(0, 0, 0)`. Each particle is animated from its drift position toward `(0, 0, 0)` over 2.0 seconds, with a per-particle stagger of `gsap.utils.random(0, 0.6)` and easing `power3.in`. By 0:04.800, all particles have converged.

As particles travel, their motion blur is enhanced by drawing a faint trail — a `THREE.Line` from each particle's previous frame position to its current, opacity 0.3, color `#FAFAFA`. Trails fade to invisible by the time the particle reaches origin.

The camera dollies forward slightly during this beat — `(0, 0, +900)` to `(0, 0, +600)` over 2.3 seconds, easing `power2.inOut`. The dolly enhances the sense of convergence without becoming a chase shot.

Ambient rustle peaks around 0:03.500 and begins to recede.

### Beat 3 — The receipt (0:04.800 to 0:06.000)

At 0:04.800, the converged particles momentarily form a single bright point at origin — held still for 0.2 seconds.

At 0:05.000, the point begins to scale and resolve into a vector illustration of a Best Buy receipt. The transition is a **shader morph**: the particle field is captured to a render texture, and a custom fragment shader cross-warps that texture toward the receipt SVG over 0.8 seconds (custom shader; if writing it is too much for the timeline, fall back to `@hyperframes/shader-transitions` → `cinematic-zoom` at 0.6s and let the receipt fade in underneath).

The receipt is centered on the frame, occupying ~30% of vertical height. It's a clean, minimal SVG illustration — not a photographic prop. Style notes:

- White paper, slight cream tint (`#FBFAF4`)
- Black ink type at Inter Mono 18px in the rendered context
- Header: **BEST BUY**
- Item line: `AirPods Pro · $199.00`
- Date line: `May 14, 2026`
- A faint receipt-paper texture overlay at 8% opacity

At 0:05.800, the receipt is fully visible. A soft paper-rustle SFX punctuates the arrival. The receipt holds for 0.2 seconds before the cut to Section ②.

### Subtitle

A single musical note glyph (`♪`) at `y = 1020px`, x-centered. Color `#707070`, Inter 18px. Appears at 0:00.500 with a fade-in of 0.3s. Holds throughout the section, fades out at 0:05.800.

### Transition out

Hard cut to Section ②. No shader, no crossfade. The cut from the receipt on pure black to the warm white of the Hook is the visual punctuation.

### Capture / external assets

None. This section is fully synthesized in Three.js + custom shader inside the composition.

### Performance notes

6,000 particles with bloom post-processing is at the upper edge of comfortable rendering speed on a typical machine. If render times become a problem, drop to 4,000 particles and increase bloom intensity to 0.7 to maintain the visual density.

---

## ② Hook — 0:06.000 to 0:22.000 (16.000s)

The first words of the film. Pure typography against warm white. The voice and the type are the only things happening on screen.

**File:** `compositions/02-hook.html`

**Background.** Warm white `#F5F5F0`, edge-to-edge. The shift from the Section ① black to this warm white is the hardest cut in the film and the most important.

**Music.** Silent. The previous section's tone faded out into the hard cut. Sixteen seconds of voice over silence.

### Type setting

All four Hook lines use the same type spec:

- Face: **Inter Display**
- Weight: 600
- Size: 112px
- Line height: 1.04
- Letter-spacing: -0.022em
- Color: `#000000`
- Alignment: center, both axes
- Position: `x = 960px, y = 540px` (frame center)

### Beat 1 — "You bought AirPods from Best Buy last week." (0:06.000 to 0:09.500)

The line appears at 0:06.000.

**Entrance animation.** The line begins at opacity 0, `y + 24px` (slightly below final position). It animates to opacity 1 and `y = 540` over 0.6s with easing `expo.out`. Stagger across words: 0.04s per word (so the line resolves left-to-right but quickly enough that it reads as one unit).

The line holds at full opacity from 0:06.600 to 0:09.000 (2.4 seconds of hold).

**Exit animation.** From 0:09.000 to 0:09.400, opacity 1 → 0, easing `expo.in`. The line clears completely by 0:09.500.

### Beat 2 — "Yesterday, the price dropped." (0:10.000 to 0:13.500)

A half-second of empty frame between Beat 1 and Beat 2. This is deliberate. Hold the silence.

The line appears in two phases to mirror the voiceover's micro-pause:

**Phase 1.** "Yesterday, the price" appears at 0:10.000 with the same entrance animation as Beat 1 (0.6s fade + 24px lift, `expo.out`).

**Phase 2.** "dropped." appears at 0:10.900 with the same animation. It enters 0.3s after the rest of the line is complete, matching the spoken pause.

Hold the complete line from 0:11.500 to 0:13.000 (1.5s).

**Exit.** Same as Beat 1, 0:13.000 to 0:13.400.

### Beat 3 — "You have 8 days to get $50 back." (0:14.000 to 0:18.000)

**Entrance.** Same animation. Single line, no phasing.

The numerals "8" and "$50" are styled identically to the surrounding text — no color shift, no weight change, no emphasis. The line is a statement, not a sale.

Hold from 0:14.600 to 0:17.500 (2.9s).

**Exit.** Same as previous, 0:17.500 to 0:17.900.

### Beat 4 — "Most people never find out." (0:19.000 to 0:22.000)

**Entrance.** Same animation. Slightly slower exit at the end to mirror the voice direction.

Hold from 0:19.600 to 0:22.500 (longer hold — this line stays through the silence that follows).

**Exit.** From 0:22.500 to 0:23.000, opacity 1 → 0, easing `expo.in` over 0.5s.

### Subtitles

The subtitle system mirrors the spoken voiceover exactly. Same Hook text, same timing, but rendered as **subtitle type, not hero type**:

- Face: Inter Display
- Weight: 500
- Size: 36px
- Color: `#000000` at 95% opacity
- Position: `x-center, y = 880px`

**Important.** In Section ②, the hero type and the subtitle are saying the same words. This is deliberate. The hero type is the cinematic statement; the subtitle is the accessibility layer (and the layer that survives on muted social autoplay). Both are visible simultaneously. The hero type is much larger; the subtitle sits below it like a stable caption.

### Transition out

A 1.0-second hold on warm white after the last subtitle clears at 0:22.000. Then a soft fade to Section ③.

The transition from Hook to Why is handled by the warm white staying continuous. There is no shader between ② and ③ — the background color doesn't change, the type just shifts in role. The eye reads it as a continuation, not a scene cut.

### Capture / external assets

None. Pure HTML and CSS, animated with GSAP.

---

## ③ Why — 0:23.000 to 0:40.000 (17.000s)

The film's argument. Three observations, delivered as quiet typography.

**File:** `compositions/03-why.html`

**Background.** Continues from Section ②: warm white `#F5F5F0`. The continuity is intentional.

**Music.** A single sustained note, C4 sine, re-enters at 0:23.000 at -24 dB and holds throughout. Drops out at 0:40.000.

### Type setting

Statement type, smaller and more reading-paced than the Hook:

- Face: Inter Display
- Weight: 500
- Size: 72px
- Line height: 1.12
- Letter-spacing: -0.015em
- Color: `#000000`
- Alignment: center, both axes
- Position: `x = 960px, y = 540px`

### Beat 1 — "It's not that the policies don't exist." (0:23.000 to 0:26.500)

Entrance: opacity 0 → 1 over 0.6s, `expo.out`. No y-axis translation this section — the lines simply appear in place. Hold 2.5s. Exit: 0.4s fade with `expo.in`.

### Beat 2 — "The price drops quietly. No one tells you." (0:27.000 to 0:31.500)

The two sentences are one entry. Same animation as Beat 1. The visual treatment doesn't separate the sentences — the punctuation does the work.

Hold 3.5s. Exit 0.4s.

### Beat 3 — The list. (0:32.000 to 0:37.500)

This is the structurally different beat in the section. The voiceover says four phrases in rhythm: *"Every store plays by different rules. Different windows. Different forms. Different ways to ask."* The typography mirrors that rhythm.

**Visual structure.** At 0:32.000, the lead clause appears: **"Every store plays by different rules."**

It enters with the standard animation. Holds for 0.8s.

Then, beneath it, the three follow-up phrases appear in sequence — each one beneath the previous, each appearing in sync with the spoken beat:

| Time     | Phrase added                  | Position (y, in px) |
|----------|-------------------------------|---------------------|
| 0:33.200 | "Different windows."          | 620                 |
| 0:34.200 | "Different forms."            | 700                 |
| 0:35.200 | "Different ways to ask."      | 780                 |

The lead clause stays at `y = 480px` throughout. The three follow-ups arrive at 80px intervals.

Each follow-up phrase enters with `expo.out` over 0.4s, opacity 0 → 1, no translation. They build a stack.

At 0:37.000, all four lines are visible on screen as a single visual idea. Hold for 1.0s.

Exit: at 0:37.500, all four lines fade together over 0.6s with `expo.in`.

### Beat 4 — "And even when you know, it's rarely worth the time." (0:38.000 to 0:40.000)

Standard entrance, 0.6s fade. The line holds from 0:38.600 to 0:39.800. Exit 0.4s with `expo.in`, completing at 0:40.000.

### Subtitles

Subtitles mirror the voiceover. One subtitle per sentence, replacing the previous in sync with the spoken delivery.

For Beat 3, **the subtitles also break on the three "Different" phrases** — three consecutive single-line subtitles, each appearing in sync with the spoken beat. The lead clause "Every store plays by different rules." is one subtitle; "Different windows." is another; and so on.

Subtitle position: `y = 880px`, same as Section ②. Color `#000000` at 95% opacity, Inter Display 36px.

### Transition out

At 0:40.000, the warm white shifts. A 0.6-second shader transition — **`@hyperframes/shader-transitions` → `flash-through-white`** — carries the cut into Section ④. The flash justifies the section change without breaking the visual continuity.

Music ends at 0:40.000 simultaneously with the shader transition starting. Music re-enters in Section ④.

### Capture / external assets

None.

---

## ④ Scale — 0:40.000 to 0:52.000 (12.000s)

The numbers. The Why section explained the cause; this section measures the cost.

**File:** `compositions/04-scale.html`

**Background.** Soft black `#0A0A0A`, edge-to-edge. The shift from warm white to soft black through the `flash-through-white` shader is the cleanest visual handoff in the film.

**Music.** Single held note continues, re-entering at -22 dB. The C4 of Section ③ drifts down to A3 by 0:46.000, deepening the tonal register.

### Type setting

Two type roles in this section:

**Hero number:**
- Face: Inter Display
- Weight: 700
- Size: 168px
- Line height: 1.0
- Letter-spacing: -0.03em
- Color: `#FAFAFA`
- Position: center, `y = 480px`

**Statement caption** (the line below each number):
- Face: Inter Display
- Weight: 500
- Size: 36px
- Line height: 1.3
- Letter-spacing: -0.005em
- Color: `#FAFAFA` at 85% opacity
- Position: center, `y = 640px`

**Source citation** (small text below the caption):
- Face: Inter
- Weight: 400
- Size: 20px
- Line height: 1.3
- Color: `#707070`
- Position: center, `y = 720px`

### Beat 1 — "Only 12% of consumers ever claim a refund." (0:40.000 to 0:45.500)

**The number appears first.** At 0:40.600 (after the shader settles), the number `12%` enters with a **count-up animation**: starts at `0%`, counts up to `12%` over 1.2 seconds with easing `power3.out`. The number resolves at 0:41.800.

**The caption appears next.** At 0:42.000, the statement caption fades in beneath the number over 0.6s with `expo.out`: *"of consumers ever claim a refund."*

**The source citation appears last.** At 0:42.600, the small source citation fades in over 0.4s: *"Source: DontPayFull, 2026"*.

Hold all three visible from 0:43.000 to 0:45.000 (2.0s).

**Exit.** A clean 0.5s fade for all three elements together, `expo.in`, completing at 0:45.500.

### Beat 2 — "$10B+ in refunds go unclaimed every year." (0:45.500 to 0:51.500)

**Shader transition between numbers.** At 0:45.500, a brief shader transition carries the change — **`@hyperframes/shader-transitions` → `domain-warp`** at 0.5s duration. This is gentler than a hard cut and faster than a fade, giving the second number the sense of being a related but different observation.

A paper-turn SFX punctuates the transition.

**The number appears.** At 0:46.000, the number `$10B+` enters with the same count-up treatment: starts at `$0`, counts to `$10B+` over 1.2s with `power3.out`.

**The caption appears.** At 0:47.200, the statement caption fades in: *"in legitimate refunds go unclaimed every year."*

**The source citation appears.** At 0:47.800: *"Estimated from U.S. Census Bureau e-commerce data."*

Hold all three from 0:48.500 to 0:51.000 (2.5s — slightly longer than the first number, because this one is the larger claim and needs more time to register).

**Exit.** 0.5s fade, `expo.in`, completing at 0:51.500.

### Subtitles

For Beat 1: *"Only 12% of consumers ever claim a refund they're entitled to."* (matches the voiceover; the on-screen caption uses a shorter phrasing.)

For Beat 2: *"Over $10B in legitimate refunds go unclaimed every year."*

Source citations are **not** included in subtitles — they live on the frame only.

### Transition out

At 0:51.500, the soft black holds for 0.5s of empty frame. The music swells gently over this half-second, foreshadowing Section ⑤. At 0:52.000, Section ⑤ begins.

### Capture / external assets

None.

---

## ⑤ Cut — 0:52.000 to 0:56.000 (4.000s)

The pivot. The shortest section of the film and the most important transition.

**File:** `compositions/05-cut.html`

**Background.** Begins on soft black `#0A0A0A` (continuing from Section ④), shifts to white `#FFFFFF` (preparing for Section ⑥) via shader transition.

**Music.** Warm pad swells in at -20 dB. A cinematic whoosh SFX rides on top of the shader transition.

### Beat 1 — "This is ClaimIt." (0:52.000 to 0:54.500)

At 0:52.000, against the continuing soft black background, the product name appears at frame center:

- Text: **ClaimIt**
- Face: Inter Display
- Weight: 600
- Size: 144px
- Letter-spacing: -0.025em
- Color: `#FAFAFA`

The name enters with `expo.out` over 0.6s, opacity 0 → 1, no y-axis translation. It holds at frame center for 1.5s (from 0:52.600 to 0:54.100), then exits with a 0.4s `expo.in` fade.

The voiceover at 0:52.000 says "This is ClaimIt." in sync with the entrance.

### Beat 2 — Transition to the Gmail interface (0:54.500 to 0:56.000)

This is the most aggressive shader transition in the film. After the product name clears, a **`@hyperframes/shader-transitions` → `cinematic-zoom`** transition runs over 1.0 seconds, carrying the frame from soft black into the white Gmail UI of Section ⑥.

The cinematic-zoom shader simulates a fast camera push — the soft black radial-blurs toward center as the white Gmail UI radial-zooms in from a distant point. By 0:55.500, the Gmail inbox is in place. The remaining 0.5s holds the inbox visible as a stable image before any animation begins (the new email arrival happens at the start of Section ⑥).

The cinematic whoosh SFX is timed to peak at 0:54.800, the midpoint of the shader transition.

### Subtitles

Subtitle at 0:52.000: *"This is ClaimIt."*

Subtitle position and styling: same as previous sections, white text at 95% opacity (matching the new white background by the time the subtitle exits at 0:54.000).

### Transition out

The cinematic-zoom shader carries directly into Section ⑥. No additional transition between them.

### Capture / external assets

None.

---

## ⑥ Demo — 0:56.000 to 2:21.000 (85.000s)

The heart of the film. Seven beats. The longest section.

**File:** `compositions/06-demo/06-demo.html` (wrapper), with seven sub-compositions imported.

**Background.** White `#FFFFFF`, edge-to-edge, matching the ClaimIt product UI's actual background. This is the only section where the frame is real product white, not warm white or off-white.

**Music.** Warm pad sustains at -20 dB throughout the entire 85 seconds.

### Sub-composition 6.1 — Inbox to dashboard (0:56.000 to 1:06.000, 10.000s)

**File:** `compositions/06-demo/6-1-inbox-to-dashboard.html`

**Visual plan.** This section is built as HTML — Gmail is not captured. A clean Gmail inbox mockup occupies the left half of the frame. A new Best Buy email arrives. The frame splits and the ClaimIt dashboard slides in from the right. A new card appears on the dashboard.

#### Beat 1.1 — Gmail at rest (0:56.000 to 0:57.500)

The Gmail UI is in place from the shader transition at the end of Section ⑤. For 1.5 seconds, the inbox sits perfectly still — just a clean list of read emails. Pure white background, light gray dividers between rows. The user sees a familiar surface.

Inbox mockup specs:
- Container: left half of frame, `x = 60` to `x = 940`, full vertical
- Top bar: Gmail logo (colored simple, public-domain reproduction), search bar, account avatar
- Email list: 5–6 placeholder rows visible, each with a light avatar circle, sender name, subject, snippet, time
- Typography: Roboto (or Inter as fallback), 16–18px, in shades of `#202124` and `#5F6368`
- Right half of frame: empty white space

#### Beat 1.2 — New email arrives (0:57.500 to 0:59.500)

A new email row slides in at the top of the inbox list. Slide from `y - 60px` to its resting position over 0.5s with `expo.out`. The row appears with a soft blue highlight (`#E8F0FE` background) that fades to the standard list background over the following 1.5s.

The email content:
- Sender: **Best Buy** (`orders@bestbuy.com`)
- Subject: **Your order has been confirmed**
- Snippet: *"Thank you for your order! Apple AirPods Pro · $199.00 · Order #BBY-201..."*
- Timestamp: **just now**

A faint single chime SFX (~660Hz, 200ms) accompanies the arrival. A tiny pulse animation ripples outward from the email's left edge once, suggesting "this just happened."

#### Beat 1.3 — Dashboard slides in (0:59.500 to 1:01.500)

The Gmail UI scales down and slides slightly left while the ClaimIt dashboard slides in from the right. Animation: 1.2s total, easing `power3.out`.

- Gmail final position: `x = 0` to `x = 880`, scale 0.95
- Dashboard final position: `x = 920` to `x = 1880`, full vertical, scale 1.0

A new purchase card appears on the dashboard's top section, animated in with `back.out(1.4)` over 0.7s (slight overshoot for emphasis). The card shows:

```
[product image: AirPods Pro thumbnail]
Apple AirPods Pro                    [Monitoring · 15 days]
Best Buy · $199.00                   Detected from Gmail
Purchased May 14, 2026
```

A subtle blue badge in the top-right of the card reads `Detected from Gmail · auto-ingested`. The card sits in the dashboard's "Active purchases" section.

#### Beat 1.4 — Upload alternative (1:01.500 to 1:06.000)

The split-screen view holds for 1 second. Then a smooth shader transition (cross-fade) carries the frame to a single full-frame view of the ClaimIt Upload Dialog.

The Upload Dialog is a centered modal:
- Width 560px, height 380px, centered at `(960, 540)`
- White card with subtle shadow
- Dashed border indicating drop zone
- Icon: an upload-arrow inside a circle, 64px
- Heading: **Upload a receipt**
- Body: *"PDF or photo. We'll extract everything."*
- Two pill buttons below: **Choose file** and **Take photo**

The dialog appears with a soft scale-in (0.95 → 1.0) and opacity 0 → 1 over 0.8s, easing `power3.out`. It holds visible from 1:02.300 to 1:05.500, then fades out over 0.5s.

#### Sound design

- 0:57.500: soft email-arrival chime, ~660Hz, 200ms duration, -28 dB
- 0:59.500: subtle UI whoosh as dashboard slides in, -32 dB
- 1:01.500: very faint paper-shuffle on transition to upload dialog

#### Subtitles

| Time     | Subtitle                                                  |
|----------|-----------------------------------------------------------|
| 0:56.000 | Connect your Gmail. ClaimIt watches your inbox.           |
| 1:00.000 | Order confirmations are detected the moment they arrive.  |
| 1:03.000 | Or upload a receipt yourself. PDF. Photo.                 |

---

### Sub-composition 6.2 — Extraction (1:06.000 to 1:14.000, 8.000s)

**File:** `compositions/06-demo/6-2-extraction.html`

**Visual plan.** This section uses a real ClaimIt UI capture composited with HTML overlays. The capture is the `/confirm/<purchase-id>` page showing Gemini Vision extraction in progress.

**Capture file.** `captures/6-2-confirm-page.mp4` — 8 seconds, 1920×1080, recorded from the deployed beta. The page shows the AirPods receipt preview on the left, extracted fields filling in on the right with green check marks.

#### Beat 2.1 — Capture plays at full frame (1:06.000 to 1:11.500)

The capture is composited at 100% of the frame. The viewer sees real product UI: a clean two-column layout, receipt preview on the left, extracted fields filling in on the right with green check marks animating in one by one.

The capture should be edited (in the recording step) to:
- Start with the page in a partially-loaded state
- Show field-by-field extraction animation taking ~5 seconds
- End with all fields filled and the **Confirm and Monitor** button highlighted

#### Beat 2.2 — Highlight overlay (1:11.500 to 1:14.000)

A subtle highlight overlay is drawn over the rightmost extracted field, calling attention to the green check mark and the **Membership tier: Plus (60-day window)** value. The overlay is a thin outline rectangle, color `#2D6A4F` at 60% opacity, stroke 2px, with a pulsing scale animation (1.0 → 1.03 → 1.0 over 1.5s, looping).

The overlay holds until 1:13.500, then fades out over 0.5s. The frame ends on the clean capture without overlay.

#### Sound design

None — the warm pad continues, no specific SFX in this section.

#### Subtitles

| Time     | Subtitle                                                          |
|----------|-------------------------------------------------------------------|
| 1:06.000 | Gemini reads every field. Brand. Item. Price paid. Membership tier. |
| 1:11.000 | If anything's uncertain, it asks before monitoring begins.        |

---

### Sub-composition 6.3 — The drop (1:14.000 to 1:24.000, 10.000s)

**File:** `compositions/06-demo/6-3-the-drop.html`

**Visual plan.** Real UI capture composited with on-screen labels. The capture is `/purchases/<id>` showing the price-history chart, then the drop event animating in.

**Capture file.** `captures/6-3-purchase-detail.mp4` — 10 seconds. The recording should show:
- 0–3s: the purchase detail page with a flat price-history chart at $199
- 3–4s: a "3 days later" overlay flies across the frame
- 4–6s: the chart drops dramatically to $149
- 6–8s: a red banner appears in the top right: **Price drop detected — $50 refund eligible**
- 8–10s: an agent reasoning panel appears below the banner with three checkmark lines

#### Beat 3.1 — Capture plays straight (1:14.000 to 1:24.000)

The capture plays at 100% of the frame. The single chime SFX (~440Hz, 300ms) punctuates the price drop moment at 1:14.300 — synced to the chart drop animation in the capture.

If the capture timing doesn't match the script exactly, the capture is edited in post (trim head/tail, adjust playback speed) before being composited.

#### Sound design

- 1:14.300: chime ~440Hz, 300ms, -22 dB

#### Subtitles

| Time     | Subtitle                                          |
|----------|---------------------------------------------------|
| 1:14.000 | Three days later. The price drops.                |
| 1:18.000 | ClaimIt checks Best Buy's policy. Confirms you're eligible. |
| 1:22.000 | Fifty dollars back. Eleven days left.             |

---

### Sub-composition 6.4 — Four types (1:24.000 to 1:36.000, 12.000s)

**File:** `compositions/06-demo/6-4-four-types.html`

**Visual plan.** Pure HTML, no captures. Four cards animate into a 2×2 grid. Three fade out. The Email card moves to center and scales up.

**Background.** Soft black `#0A0A0A`. The shift from white (6.3) to soft black (6.4) is a hard cut, justified by the conceptual shift (from "specific demo" to "explaining the system").

#### Beat 4.1 — Hard cut to black (1:24.000)

Hard cut. No shader. The white capture ends abruptly and the soft black 6.4 frame appears.

#### Beat 4.2 — Four cards arrive (1:24.000 to 1:26.000)

Four cards animate into a 2×2 grid. Card positions (each card is 720×280px):

| Card | Title                       | Subtitle                                       | Position (x,y) of card center |
|------|-----------------------------|-----------------------------------------------|-------------------------------|
| TL   | Email                       | For hotels and most online retailers          | (560, 340)                    |
| TR   | Live Chat Script            | For Best Buy, Macy's, and others              | (1360, 340)                   |
| BL   | In-Store Guide              | For Staples, Costco warehouse                 | (560, 740)                    |
| BR   | Self-Service Walkthrough    | For airline rebookings                        | (1360, 740)                   |

Card visual spec:
- Background: `#1A1A1A` (slightly lighter than the section background)
- Border: 1px solid `#2A2A2A`
- Border-radius: 16px
- Padding: 32px
- Title type: Inter Display 48px / weight 600 / `#FAFAFA`
- Subtitle type: Inter 22px / weight 400 / `#A0A0A0`

Entrance animation: all four cards animate in simultaneously with a staggered start. Each card scales from 0.92 to 1.0 and fades from opacity 0 to 1 over 0.8s with `power3.out`. Stagger between cards: 0.1s. By 1:25.500, all four cards are visible.

Cards hold visible from 1:25.500 to 1:33.000 (7.5s).

#### Beat 4.3 — Three cards exit, Email card centers (1:33.000 to 1:35.500)

Three cards (Live Chat Script, In-Store Guide, Self-Service Walkthrough) animate out simultaneously: scale 1.0 → 0.85, opacity 1 → 0, over 0.5s with `expo.in`. They are fully cleared by 1:33.500.

The Email card animates to frame center and scales up:
- Position: from `(560, 340)` to `(960, 540)` (frame center)
- Scale: from `1.0` to `1.35`
- Duration: 0.8s
- Easing: `power3.out`

The card holds at the larger center position from 1:34.300 to 1:36.000 (1.7s).

A subtle highlight appears around the Email card title during this hold — a 1px stroke in `#2D6A4F` (money green) at 80% opacity, with a soft glow effect (CSS `box-shadow: 0 0 24px rgba(45, 106, 79, 0.4)`).

#### Sound design

- 1:24.000: brief soft pop on the hard cut (transient -32 dB)
- 1:33.000: subtle UI whoosh as three cards depart
- 1:34.000: tiny tonal cue as the Email card lands centered

#### Subtitles

| Time     | Subtitle                                                          |
|----------|-------------------------------------------------------------------|
| 1:24.000 | Every store accepts claims a different way.                       |
| 1:28.000 | An email.                                                         |
| 1:29.000 | A live chat script.                                               |
| 1:30.000 | An in-store guide.                                                |
| 1:31.000 | A self-service walkthrough.                                       |
| 1:33.000 | For Best Buy, it's an email. From your address — not ours.        |

The four list items in the spoken VO appear as four consecutive subtitles, each replacing the previous in sync with the voice.

---

### Sub-composition 6.5 — The three-pane review (1:36.000 to 1:46.000, 10.000s)

**File:** `compositions/06-demo/6-5-three-pane.html`

**Visual plan.** Real UI capture. The `/claims/[id]` three-pane approval page in its initial state.

**Capture file.** `captures/6-5-three-pane.mp4` — 10 seconds. The recording shows:
- 0–2s: the three-pane layout loads, all three panes filling in
- 2–6s: the draft email is visible in the left pane, evidence in the center pane, an empty Assistant placeholder on the right
- 6–10s: the page sits stable, ready for the next section to zoom in

#### Beat 5.1 — Shader transition from soft black to UI (1:36.000 to 1:36.600)

The transition from Section 6.4 (Email card on soft black) to Section 6.5 (three-pane on white) is a **`@hyperframes/shader-transitions` → `liquid-wipe`** at 0.6s. This is the third and final shader transition in the demo — chosen for its sense of "settling into place," which matches the narrative beat of "now we're inside the actual product."

#### Beat 5.2 — Capture plays straight (1:36.600 to 1:46.000)

The capture plays at 100% frame. The three-pane UI is visible in its real state. No overlays added during this beat — the voiceover names what's on screen and the viewer reads it.

#### Sound design

- 1:36.000: subtle whoosh on the liquid-wipe transition
- 1:36.600: very soft "UI settle" sound — a barely-audible click

#### Subtitles

| Time     | Subtitle                                                       |
|----------|----------------------------------------------------------------|
| 1:36.000 | Here's the draft.                                              |
| 1:39.000 | Here's the evidence. The policy clause. The price screenshot. Your receipt. |
| 1:43.000 | And here's an Assistant that knows everything about this specific claim. |

---

### Sub-composition 6.6 — Asking the Assistant (1:46.000 to 2:02.000, 16.000s)

**File:** `compositions/06-demo/6-6-assistant.html`

**Visual plan.** The most action-dense beat of the film. Camera zooms to the right Assistant pane. User types a question. Assistant streams a response. Left pane updates with a highlight pulse.

**Capture file.** `captures/6-6-assistant-pane.mp4` — 16 seconds. The recording shows:
- 0–1.5s: the three-pane layout from 6.5, camera zooming toward the right pane
- 1.5–4s: the right Assistant pane fills the frame, empty chat with input placeholder
- 4–7s: the user types the question (real keystrokes recorded)
- 7–15s: the Assistant streams its response (real SSE stream)
- 15–16s: the camera pulls back slightly, the left pane (off-frame) refreshes with a soft highlight pulse

If recording the real interaction is too slow or unreliable, this beat can be assembled as HTML with a scripted typewriter animation and a scripted streaming animation. The decision is made after the first capture attempt.

#### Beat 6.1 — Camera zoom in (1:46.000 to 1:48.000)

A 2-second smooth zoom from the wide three-pane view to a centered close-up of the Assistant pane. The zoom is handled in the capture itself (real CSS transform animation in the recording context), not by HyperFrames camera-emulation in HTML.

By 1:48.000, the Assistant pane fills ~70% of the frame width, centered horizontally.

A soft single chime SFX (~660Hz, 200ms, -25 dB) punctuates the arrival of the zoom.

#### Beat 6.2 — User question types in (1:48.000 to 1:51.000)

The user's question appears in the input field with a realistic typing animation: characters appear one at a time at ~80ms per character, with natural variation (some pauses, some bursts).

The question, typed in full:

> Does my Best Buy Plus membership extend the window?

Soft typing-sound bed underneath (very faint, -36 dB) — not a stylized typewriter, just enough sound to feel real.

#### Beat 6.3 — Send and stream begins (1:51.000 to 1:59.000)

At 1:51.000, the user's question is "sent" — the input field clears, the question appears as a user chat bubble in the conversation, aligned right.

A short pause (0.5s), then the Assistant's response begins streaming. The streaming is SSE-style: characters appear in chunks of 2–5 at a time, with the appearance of natural pauses between words. Total streaming duration: 7 seconds, ending at 1:58.500.

The Assistant's response:

> Yes. Plus members get 60 days instead of 15.
> You purchased on May 14. Your window closes
> July 13 — 44 days from now.

The response bubble is left-aligned, in a slightly lighter blue tone than the user bubble. As the streaming completes, a small "policy citation" appears beneath the bubble: a clickable text link reading *Source: Best Buy price match policy* in `#1A73E8`.

#### Beat 6.4 — Left pane updates (1:59.000 to 2:02.000)

The camera pulls back slightly (zooms from the close-up back to a mid-shot of the full claim page) over 1.5s with `power2.inOut`. As the left pane comes back into view, a soft highlight pulse runs across it — a faint blue glow (`rgba(26, 115, 232, 0.2)`) that ripples once, suggesting the draft has been updated with the new context.

The frame settles into a stable mid-shot for the last 1.5 seconds, ready for Section 6.7.

#### Sound design

- 1:48.000: chime ~660Hz, 200ms, -25 dB
- 1:48.500–1:51.000: faint typing bed, -36 dB
- 1:51.500–1:58.500: very faint streaming "tick" — barely audible texture, -42 dB
- 1:59.500: a single soft synth note marking the left-pane highlight

#### Subtitles

| Time     | Subtitle                                                       |
|----------|----------------------------------------------------------------|
| 1:46.000 | Ask the Assistant anything.                                    |
| 1:58.000 | It pulls the policy, your purchase, and the agent's own reasoning. |

The user's typed question and the Assistant's response are **not** subtitled — they are visible on screen as chat bubbles, which is their own visual layer.

---

### Sub-composition 6.7 — Approve and send (2:02.000 to 2:21.000, 19.000s)

**File:** `compositions/06-demo/6-7-approve.html`

**Visual plan.** Real UI capture of the approve flow, with HTML overlays for the post-send notification and the closing card.

**Capture file.** `captures/6-7-approve-flow.mp4` — 14 seconds. The recording shows:
- 0–2s: the three-pane page, cursor moving to the **Approve & Submit** button
- 2–3s: cursor clicks the button, a confirmation dialog appears (*Submitting claim...*)
- 3–6s: the dialog resolves, claim status changes from *Draft pending* to *Submitted*
- 6–10s: a toast notification appears in the top-right: *Email sent from your Gmail*
- 10–14s: the page settles into the submitted state, ready for an HTML overlay

After 14s of capture, HTML takes over for the closing visual.

#### Beat 7.1 — Capture plays, approve and send (2:02.000 to 2:16.000)

The capture plays at 100% frame. The keyboard-tap SFX (-22 dB) punctuates the moment the Approve button is clicked, around 2:04.000. The tonal "ding" SFX (~880Hz, -22 dB) punctuates the email-sent confirmation around 2:13.000.

#### Beat 7.2 — Closing card (2:16.000 to 2:21.000)

At 2:16.000, the captured submitted-state page fades to dimmed (CSS filter brightness 0.5) and a centered card animates in:

```
AirPods Pro

$50 refund
Pending Best Buy response

Sent from your Gmail · 11 days remaining
```

Card visual spec:
- Width 720px, padding 48px
- Background `#FFFFFF`, soft shadow (`0 24px 64px rgba(0, 0, 0, 0.12)`)
- Border-radius 24px
- Centered at frame center
- Type: Inter Display, mixed weights as the design hierarchy demands

Entrance: scale 0.94 → 1.0, opacity 0 → 1, over 0.8s with `expo.out`.

The card holds visible from 2:17.000 to 2:20.500 (3.5s). Exits with a 0.5s fade over the cut into Section ⑦.

#### Sound design

- 2:04.000: keyboard tap, -22 dB
- 2:13.000: tonal ding ~880Hz, 400ms, -22 dB
- 2:16.500: subtle UI whoosh as closing card enters

#### Subtitles

| Time     | Subtitle                                                         |
|----------|------------------------------------------------------------------|
| 2:02.000 | Approve and send.                                                |
| 2:05.000 | The email goes from your Gmail.                                  |
| 2:08.000 | Your address. Your name. Your account.                           |
| 2:13.000 | Best Buy replies to you. Not to us.                              |
| 2:17.000 | Fifty dollars back. Done.                                        |

---

## ⑦ Reach — 2:21.000 to 2:35.000 (14.000s)

The film's breadth statement. Twenty-six platforms, three categories, one architecture.

**File:** `compositions/07-reach.html`

**Background.** Warm white `#F5F5F0` returns. The shift from white product UI (⑥) to warm white (⑦) is a soft cut, justified by the section change from "specific" to "general."

**Music.** Warm pad fills out, gently swelling — still under -18 dB, but with a sense of arrival.

### Beat 7.1 — The grid arrives (2:21.000 to 2:24.500)

A wall of platform logos animates in as a structured grid. **Twenty-six logos** in a 5-row layout:

- Row 1 (Retail): Best Buy, Home Depot, Lowe's, Costco, Dell, Crutchfield, Target — 7 logos
- Row 2 (Retail): Staples, Dick's, Nordstrom, Macy's, JCPenney, Newegg — 6 logos
- Row 3 (Airlines): Southwest, JetBlue, Delta, Alaska, American, United — 6 logos
- Row 4 (Hotels): Hilton, Marriott, Hyatt, IHG, Wyndham — 5 logos
- Row 5 (Analytics-only / excluded): Amazon, Walmart — 2 logos (visually dimmed with "tracked for analytics" / "no policy" annotations)

Each logo cell is approximately 220×140px with 24px gaps. The grid is centered horizontally and slightly higher than vertical center, occupying `y = 200` to `y = 880`.

Each logo is a clean monochrome SVG version of the brand mark — never a photographic logo, never the brand's actual colored version (this is an editorial use; we're showing platform coverage, not running their advertising for them).

The grid enters with a staggered animation: each logo fades in over 0.5s with `expo.out`, stagger 0.03s per logo. The full grid is visible by 2:24.000.

To the right of the grid (or below it on tighter layouts), a vertical column of *monitored purchases* scrolls slowly. Each row shows a thumbnail, product name, platform, and a small icon for the claim type (email envelope, chat bubble, in-store storefront, walkthrough arrow). The list scrolls upward at a constant rate of 30px per second — a marquee effect, looping seamlessly.

### Beat 7.2 — Voice carries (2:24.500 to 2:33.000)

The grid sits stable for 8.5 seconds while the voiceover speaks. The marquee continues to scroll. Nothing else moves except the marquee.

At 2:32.000, all 26 logos pulse once together — each scales briefly to 1.05 and back to 1.0 over 0.5s with `power2.inOut`, simultaneous across the grid. A soft chord plays underneath (already part of the music swell).

### Beat 7.3 — Statement (2:33.000 to 2:35.000)

The grid fades to 60% opacity, and a single statement appears across it at frame center:

> All from day one.

Type: Inter Display, weight 600, 72px, color `#000000` at 95% opacity, centered.

Entrance: opacity 0 → 1 over 0.6s, `expo.out`. Holds from 2:33.600 to 2:34.500 (0.9s). Exit: 0.5s fade with `expo.in`.

### Subtitles

| Time     | Subtitle                                                       |
|----------|----------------------------------------------------------------|
| 2:21.000 | Best Buy is one platform we ran end to end for this hackathon. |
| 2:26.000 | ClaimIt's architecture extends to 26.                          |
| 2:28.500 | Retail.                                                        |
| 2:30.000 | Airlines.                                                      |
| 2:31.500 | Hotels.                                                        |
| 2:33.000 | All from day one.                                              |

### Sound design

- 2:32.000: soft synth pulse underneath the simultaneous logo flash

### Transition out

At 2:35.000, the warm white shifts to deep black via a soft 0.5s crossfade. This is the only crossfade in the film — every other section transition is either hard cut or shader. The crossfade is chosen here because the transition into the close is meant to feel like a slow exhale, not a punctuation.

### Capture / external assets

- All 26 platform logos as monochrome SVGs. Stored at `assets/logos/`.
- The marquee items reuse logo SVGs plus product thumbnails from the seeded fixtures.

---

## ⑧ Close — 2:35.000 to 2:48.000 (13.000s)

The closing frame of the film.

**File:** `compositions/08-close.html`

**Background.** Deep black `#000000`, edge-to-edge.

**Music.** The warm pad swells into a resolved major chord at -22 dB, holds through to 2:46.000, then fades out gracefully to silence by 2:48.000.

### Beat 8.1 — Tech card materializes (2:35.000 to 2:38.500)

On the left half of the frame, a vertical tech credits column animates in line by line.

Column position: `x = 200` to `x = 800`, vertically centered (`y = 360` to `y = 820`).

The column content:

```
BUILT WITH
─────────────────
Google Cloud Agent Builder
Gemini
MongoDB Atlas · MongoDB MCP
Arize Phoenix · Phoenix MCP
Cloud Run · Pub/Sub · Cloud Scheduler
Gmail API · ScraperAPI
Elasticsearch · Next.js · Vercel
```

Header **BUILT WITH**:
- Face: JetBrains Mono
- Weight: 500
- Size: 22px
- Letter-spacing: 0.18em
- Color: `#707070`

Divider line: a 280px horizontal rule, `#1F1F1F`, beneath the header.

Item rows:
- Face: Inter Display
- Weight: 500
- Size: 28px
- Line height: 1.6
- Color: `#FAFAFA` at 90% opacity

Animation: each row animates in with a 0.5s fade-up (opacity 0 → 1, y +8px → 0), stagger 0.08s per row. The header arrives first at 2:35.300; the last item resolves by 2:38.000.

### Beat 8.2 — Closing line first half (2:38.500 to 2:41.500)

On the right half of the frame, the first closing line appears:

> The money was always yours.

Type:
- Face: Inter Display
- Weight: 600
- Size: 80px
- Line height: 1.1
- Letter-spacing: -0.02em
- Color: `#FAFAFA`
- Position: `x = 1080` to `x = 1820`, vertically centered slightly above the second line's eventual position (`y = 480`)

Entrance: opacity 0 → 1 over 0.7s with `expo.out`, slight `y` lift from +16px → 0px.

The line holds visible from 2:39.200 to 2:41.500 (2.3s). No exit animation yet — the line stays.

The voiceover at 2:39.000 speaks the line. The soft chime SFX (~660Hz, 300ms, -22 dB) punctuates just before the voice begins, at 2:38.800.

### Beat 8.3 — Closing line second half (2:41.500 to 2:46.000)

A 1.5-second silence after the first line is fully on screen. This is the longest pause in the film, and it is intentional.

At 2:43.000, the second closing line appears beneath the first:

> We just make sure you get it.

Same type spec as the first line. Position: `y = 600`.

Entrance: opacity 0 → 1 over 0.7s, `expo.out`, slight `y` lift.

Both lines hold visible together from 2:43.700 to 2:46.000 (2.3s). The voiceover speaks the second line at 2:43.000 in sync with the entrance.

### Beat 8.4 — Credit line (2:35.000 to 2:48.000)

At the very bottom of the frame, a small credit line is visible for the entire 13 seconds of Section ⑧:

> ClaimIt · Team Sabis · Google Cloud Rapid Agent Hackathon · June 2026

Type:
- Face: Inter
- Weight: 500
- Size: 16px
- Letter-spacing: 0.06em
- Color: `#707070`
- Position: `y = 980`, centered horizontally

This line appears at 2:35.500 with a soft fade-in (0.6s), holds throughout the section, and fades out with the rest of the frame at 2:47.500.

### Beat 8.5 — Fade to black (2:46.000 to 2:48.000)

All on-screen elements fade together: the tech column, both closing lines, and the credit line. Opacity 1 → 0 over 1.5s with `power2.in`. Music tails out simultaneously.

By 2:48.000, the frame is pure black. Silence.

The film ends.

### Subtitles

| Time     | Subtitle                                  |
|----------|-------------------------------------------|
| 2:39.000 | The money was always yours.               |
| 2:43.000 | We just make sure you get it.             |

Subtitles are positioned per the usual convention at `y = 880px`, but in Section ⑧ they overlap with the bottom of the closing line text. To avoid visual collision:
- Subtitle in Beat 8.2 is positioned at `y = 940px` (lower than usual)
- Subtitle in Beat 8.3 is positioned at `y = 940px` as well

Color: `#FAFAFA` at 95% opacity. Inter Display 36px.

### Sound design

- 2:38.800: chime ~660Hz, 300ms, -22 dB
- 2:46.000–2:48.000: music tail to silence

### Transition out

The film ends at 2:48.000 on pure black silence. No logo bumper. No URL card. No "thanks for watching." The closing line is the last thing the audience reads, and nothing follows it.

### Capture / external assets

None.

---

## Render order and final stitch

Each composition is rendered independently as a single MP4 file at 1920×1080, 60fps. Voice files are mixed into each composition at render time. Music and SFX are mixed in post during the final stitch step.

Render order:

```
01-opening.mp4
02-hook.mp4
03-why.mp4
04-scale.mp4
05-cut.mp4
06-demo.mp4        ← internally stitched from the seven 6.x sub-files
07-reach.mp4
08-close.mp4
```

Final stitch: a HyperFrames root composition (`index.html`) that imports all eight section files and arranges them on a continuous timeline. The root file controls the music bed, the cross-section sound design, and the final color grade. Final output: `renders/claimit-demo-v1.mp4`.

### Render command

```bash
cd demo-video
npm run check    # validate compositions
npm run render   # render to renders/claimit-demo-v1.mp4
```

Expected render time on a 2024 MacBook Pro: ~12–18 minutes for the full 2:48 at 60fps, depending on the Three.js particle scene's complexity in Section ①.

---

## Changelog

```
v1.0 — 2026-05-31 — Initial lock for first render.
```

---

*End of storyboard.*
