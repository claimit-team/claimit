# Design follow-ups

Tracked deviations and follow-ups discovered during the `ws5/visual-polish-batch` audit. The three spec docs in this directory remain the source of truth; this file is a working scratchpad.

## Shadcn-token leak (light/dark unification)

Several feature components consume the raw shadcn tokens (`--background`, `--foreground`, `--card`, `--popover`) instead of the ClaimIt neutrals (`--neutral-0`, `--neutral-900`, etc.). Both token sets are defined in `apps/web/src/app/globals.css` and the visuals look correct in light mode, but the dark-mode story is split-brained: shadcn defaults invert via OKLCH while ClaimIt neutrals lift via HSL.

Surface to migrate in a future PR (shadcn primitives under `apps/web/src/components/ui/*` are intentionally excluded):

- `apps/web/src/components/security/*` (security hero, principles, sections, related-documents)
- `apps/web/src/components/help/help-view.tsx`
- `apps/web/src/components/help/contact-support-view.tsx`

Recommendation: replace `bg-background` -> `bg-neutral-0`, `text-foreground` -> `text-neutral-900`, `bg-card` -> `bg-neutral-0`, `bg-popover` -> `bg-neutral-0` in those feature components only.

## Display-scale tokens

`design-system.md` §3 defines Display L (56px), Display M (44px), Display S (32px). Today `apps/web/src/app/globals.css` does not expose these as Tailwind utilities; pages reach for ad-hoc `text-4xl` / `text-3xl`. A future PR could either:

1. Add `--text-display-l` / `--text-display-m` / `--text-display-s` font-size tokens to the `@theme inline` block, or
2. Document a Tailwind class mapping (e.g. `text-4xl` = Display M) directly in `design-system.md`.

## Identity platform (5.2)

`apps/web/src/app/(authenticated)/layout.tsx` currently reads from `apps/web/src/components/settings/settings-mock.ts` for header user identity. Workspace 5.2 will introduce a real session source; remove the temporary import at that point.

## Landing redesign — mobile QA (375 / 768 / 1280 px)

QA pass on `ws5/landing-redesign-batch` confirmed the following at the three target breakpoints. No code changes required:

- Hero (`hero-section.tsx`): below `lg` (1024 px) the 5-column grid collapses to a single column; headline (`text-5xl sm:text-6xl lg:text-7xl`) stays within the viewport thanks to `text-balance`; CTA row stacks via `flex flex-col sm:flex-row`; video container is `w-full max-w-2xl aspect-video` so it shrinks to viewport-width minus 32 px of horizontal padding.
- Hero gradient (`radial-gradient(... at 90% 10%, ...)`): at 375 px the anchor moves toward the right edge and the brighter zone clips against the section's `overflow-hidden`. The remaining wash reads as a soft glow in the upper-right corner — acceptable. If a future review wants a tighter mobile fall-off, a `@media (max-width: 640px)` rule can move the anchor to `100% 0%`.
- Logo Wall (`logo-wall-section.tsx`): 80 px edge fades stay visible at 375 px; marquee duration of 60 s feels gentle (effective velocity ~20 px/s with a doubled-track width near 2 400 px). No mobile-specific media query needed.
- How It Works (`how-it-works-section.tsx`): below `sm` the compact two-up grid for Steps 1+2 collapses to a single column; Step 3's expanded card collapses its internal `lg:grid-cols-2` to a vertical stack — left half (icon + copy + chip row) followed by the Assistant + Claim Draft mocks. Chip row wraps via `flex flex-wrap`.
- Output Types, Social Proof, Final CTA: all use mobile-first grids (`sm:grid-cols-2 lg:grid-cols-4`, `sm:grid-cols-3`, single-column centered) and need no additional tweaks.
- Motion: scroll-triggered fade-up is GPU-accelerated and quiet at 375 px (no jank observed); `motion/react` honors `prefers-reduced-motion` automatically. The marquee respects `prefers-reduced-motion: reduce` via the CSS rule in `globals.css`.
- CTA accent rings: at rest the ring is `ring-brand-accent-500/0` (fully transparent) so no 1-px outline is visible on touch.
