// Standard easing curves — per VIDEO_PRODUCTION_BIBLE.md §III.2 + Appendix A.
// Every beat / shot imports from here. No inline bezier values in beat code.

import { Easing } from "remotion";

export const easings = {
  /** Element entrance (fade-in, scale-up, slide-in). Apple-style: quick arrival, long stable tail. */
  easeOut: Easing.bezier(0.16, 1, 0.3, 1),
  /** Element exit (fade-out, scale-down). Slow start, accelerated departure. */
  easeIn: Easing.bezier(0.4, 0, 1, 1),
  /** Same element state change (color / position morph). Material standard. */
  easeInOut: Easing.bezier(0.4, 0, 0.2, 1),
  /** Tight, snappy micro-motion (button press, icon flick). */
  sharpOut: Easing.bezier(0.4, 0, 0.6, 1),
  /** Slow, deliberate reveal for large content (paragraphs, hero sections). */
  slowReveal: Easing.bezier(0.65, 0, 0.35, 1),
} as const;

export type EasingName = keyof typeof easings;
