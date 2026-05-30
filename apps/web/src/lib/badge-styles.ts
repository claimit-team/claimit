/**
 * Shared status-badge sizing — single source of truth for the
 * "world-class" badge shape used across the /claims and /purchases list
 * + detail surfaces.
 *
 * The COLORS differ per surface (claim outcome vs purchase status, see
 * `claim-outcome-badge.tsx` and `purchase-status.ts`), but the SIZING
 * must be identical so the two list pages read as one design system:
 * fixed minimum width (no badge "breathing" as label length varies),
 * centered text, pill radius, no wrap.
 *
 * Layered AFTER the per-status color classes in `cn()` so tailwind-merge
 * gives these priority over the CVA `Badge` variant's `px-2` /
 * `rounded-4xl` defaults.
 */
export const BADGE_BASE_CLASSES =
  "text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap min-w-[6.5rem] text-center";
