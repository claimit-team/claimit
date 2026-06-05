# HOOK Light-Mode Redesign — Patch Spec (v1.1)

> **Purpose**: Invert HOOK atmosphere from dark (`#080C14` + white text) to LIGHT (`apps/web`-matching bg + dark text). This is a focused color/atmosphere fix, NOT a full rebuild — animations / frame plans / subtitle stay unchanged.
> **Reason**: `apps/web` production UI is light mode (white bg, dark text, navy accents). HOOK on dark mode creates visual disconnect when the demo transitions to Architecture / Refund Demo beats which use real product UI.
> **Created**: 2026-06-03 · **For**: Claude Opus 4.8 in Claude Code

---

## What changes / what doesn't

| Component | Change? | New |
|---|---|---|
| HookAtmosphere bg | ✅ Yes | Light bg matching `apps/web` |
| HookAtmosphere film grain | ✅ Drop | Looks dirty on light bg |
| HookAtmosphere scan lines | ✅ Drop | Don't work on light bg |
| HookAtmosphere vignette | ✅ Adjust | Subtle dark-corner overlay, light center |
| Beat01-04 main text color | ✅ Yes | White → dark |
| Beat02 icon stroke | ✅ Yes | White → dark |
| Beat03 dot fill | ✅ Yes | Light gray → mid-tone gray (visible on light bg) |
| Beat03 red dots + halo | ❌ No | Red still pops on light bg, keep |
| Beat04 ClaimIt navy wordmark | ❌ No | Navy on light = matches apps/web "Try Free" button perfectly |
| BeatSubtitle (orange #FFA500 on dark pill) | ❌ **No, hard constraint** | Universal LAW — pill is self-contained |
| Frame plans / animations / timings | ❌ No | All untouched |
| VO files | ❌ No | All untouched |
| BEAT_SHEET | ❌ No | All untouched |

---

## Task 1 — Verify apps/web actual colors first

Before adding tokens, read `apps/web/src/app/globals.css` to identify the EXACT values used in the production UI for:

- `body { background }` or `:root { --background }`
- `body { color }` or `:root { --foreground }`
- Surface/card background (if different from body)

These are usually `oklch()` values. Convert to hex for use in `polish/tokens.ts` (oklch → hex conversion can be done with any online tool or by computing manually). Report the hex values found.

If the values aren't reachable (e.g. `globals.css` uses CSS custom properties resolved at runtime), pick the conservative defaults:
- Body bg: `#FAFBFC` (subtle off-white)
- Body text: `#0F1419` (very dark charcoal, premium)

Note in the report which path was taken (real-from-globals vs defaults).

---

## Task 2 — Update `polish/tokens.ts` (now permitted)

The do-not-modify rule on `tokens.ts` is **lifted for this patch**. Add light-mode companion tokens. Don't remove dark-mode tokens — keep both:

```ts
colors: {
  // ... existing dark tokens stay ...

  bg: {
    dark: "#080C14",      // legacy / for future dark-mode beats
    light: "<from Task 1>", // NEW — primary body bg
    surface: "#FFFFFF",   // NEW — card / elevated surface bg
  },

  text: {
    dark: "<from Task 1>",  // NEW — primary dark text
    muted: "#374151",       // NEW — secondary / caption text
    light: "#FAFBFC",       // legacy / for future dark-mode beats
  },

  // brand.primary (navy) and semantic.danger (red) stay UNCHANGED.
}
```

Confirm by `view`ing the updated file after edit.

---

## Task 3 — Rewrite `polish/HookAtmosphere.tsx`

Replace the 4-layer dark atmosphere with light-mode equivalent:

```
Layer 0: AbsoluteFill { backgroundColor: colors.bg.light }
Layer 1: subtle vignette — radial gradient overlay
         center: transparent → corners: rgba(0,0,0,0.05) ~5% darker
Layer 2: DROP film grain entirely
Layer 3: DROP scan lines entirely
```

Final result: clean light surface with very gentle corner darkening. Apple product page feel.

Keep `useCurrentFrame` import for future-API consistency, but no frame-driven movement needed since grain/scan are dropped.

---

## Task 4 — Update Beat color references

For each of `Beat01.tsx`, `Beat02.tsx`, `Beat03.tsx`, `Beat04.tsx`, change:

| Was | Becomes |
|---|---|
| `colors.neutral[0]` (white text/stroke) | `colors.text.dark` |
| `colors.neutral[300] at 0.9 opacity` (Beat01 accent line) | `colors.text.dark at 0.6 opacity` |
| `colors.neutral[100] at 0.94 opacity` (Beat03 caption) | `colors.text.dark at 0.94 opacity` |
| `colors.neutral[500]` (Beat03 & Beat04 neutral dots) | `colors.text.muted at 0.55 opacity` — mid-gray that reads on light bg |

**DO NOT change**:
- `colors.semantic.danger` (Beat03 red dots + halo) — red still pops
- `colors.brand.primary` (Beat04 ClaimIt navy wordmark) — navy on light = matches `apps/web` Try Free button
- Any frame numbers, any animation logic, any layout positions

Visually scan the diff before render. If you changed anything other than colors, undo it.

---

## Task 5 — DO NOT modify BeatSubtitle.tsx

The orange `#FFA500` on `rgba(8,12,20,0.72)` pill is **universal PROJECT LAW**. The dark pill provides its own contrast — works on both light AND dark backgrounds. On light bg the dark pill is more prominent (like Apple Keynote bottom captions on white slides). Leave it alone.

If you find yourself thinking "but the pill should match the light theme..." — STOP. The pill is the constant signal across the whole 3-minute video. It stays.

---

## Task 6 — Re-render all 4 mp4s + 24 stills

Use the `--timeout=120000` render flag (per your prior deviation note — font loading needs it under render concurrency).

For each beat (01 → 04):

```bash
npx remotion render src/index.ts Beat0X out/shorts/b0X_hook-<slug>.mp4 \
  --crf=18 --color-space=bt709 --pixel-format=yuv420p \
  --image-format=png --scale=2 \
  --audio-bitrate=320k --audio-codec=aac \
  --timeout=120000
```

Plus 6 stills per beat at f000/060/120/180/240/299.

**Overwrite** the existing v1 mp4s and stills — old dark-mode versions are deprecated.

---

## Task 7 — Self-check

Same `grep` guard as before — no `transition:`, no `@keyframes`, no `setTimeout`, no `<img|video|audio>` non-Remotion, no `Easing.linear`, no `#[0-9a-fA-F]{3,6}` literals in beat code (the literal hexes added to `tokens.ts` and `BeatSubtitle.tsx` are OK; beat code reads from tokens).

Visually verify at least 2 stills per beat that:
- Background is light
- Main text is dark
- Subtitle pill is orange-on-dark, readable
- Beat03 red dots + halo still visually punch against the mid-gray dot field
- Beat04 navy "ClaimIt" wordmark reads correctly on light bg

---

## Task 8 — Report

A. Path to updated `tokens.ts` with diff summary
B. Hex values found in `apps/web/globals.css` (or default fallback noted)
C. Path to updated `HookAtmosphere.tsx`
D. Per-beat: color tokens changed (list `was → becomes`)
E. 4 new mp4 paths (overwritten from v1) with sizes
F. Render observations — anything looking off (grain too subtle? dots too pale? caption hard to read?)

Then STOP. User reviews v1.1 light-mode HOOK in Remotion Studio before Batch D.

---

## Constraints

- NO ElevenLabs API calls (key revoked — would fail anyway)
- NO changes to: `gen_vo.mjs`, `vo_lines.json`, `vo_lines.ts`, `.env`, `vo_b*.mp3`, `load-fonts.ts`, `_archive/`, legacy `Subtitle.tsx`, `BEAT_SHEET.md`, frame plans, animation logic, layout positions
- ALLOWED: `tokens.ts` (this patch only), `HookAtmosphere.tsx`, `Beat01-04.tsx` (color refs only), re-rendering
- All animations stay frame-driven
- Inter font only
- No commits
