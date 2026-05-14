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
