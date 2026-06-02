// Single source of truth for design tokens used by polish components +
// section compositions. Values come from FRONTEND_RECON.md §3 (the real
// apps/web palette + type scale) and STORYBOARD.md §"Visual system".

export const COLOR = {
  // Film palette (STORYBOARD §Visual system → Palette)
  deepBlack: "#000000",
  softBlack: "#0A0A0A",
  warmWhite: "#F5F5F0",
  warmWhiteDim: "#EFEFE9",
  pureWhite: "#FFFFFF",
  offWhiteText: "#FAFAFA",
  midGray: "#707070",
  lineOnDark: "#1F1F1F",
  lineOnLight: "#E5E5E0",
  moneyGreen: "#2D6A4F",
  softRed: "#C73E3A",
  bestBuyYellow: "#FFE000",
  gmailBlue: "#1A73E8",
  quietBlue: "#0F4C75",

  // Product palette mirror (FRONTEND_RECON §3) — used inside Section 6 panes
  brand: {
    primary500: "hsl(217, 50%, 30%)", // navy — primary buttons, Assistant Sparkles
    primary50: "hsl(217, 33%, 97%)", // pill backgrounds
    primary700: "hsl(217, 70%, 17%)",
    accent500: "hsl(142, 65%, 32%)", // money green — RECLAIMED MONEY ONLY
  },
  neutral: {
    0: "#FFFFFF",
    50: "hsl(220, 20%, 98%)",
    100: "hsl(220, 18%, 95%)",
    200: "hsl(220, 15%, 90%)",
    300: "hsl(220, 12%, 80%)",
    400: "hsl(220, 10%, 60%)",
    500: "hsl(220, 10%, 45%)",
    600: "hsl(220, 13%, 32%)",
    700: "hsl(220, 15%, 22%)",
    800: "hsl(220, 18%, 14%)",
    900: "hsl(220, 22%, 8%)",
  },
} as const;

/**
 * APPLE_TYPE — the canonical typographic system for the film.
 *
 * Designed to feel Apple-grade: large but never shouting, restrained
 * weights (500–600 on display), aggressive negative tracking, generous
 * negative space. Every section's hero / number / statement / caption
 * text should route through this scale instead of inventing its own
 * sizes and tracking values.
 *
 * Two ladders are exposed:
 *   `APPLE_TYPE.display.<role>` — pure visual treatments (size, weight,
 *      tracking, line-height) ready to drop into a CSS style.
 *   `APPLE_TYPE.helper(role)` — returns a CSSProperties object so a
 *      component can `style={...APPLE_TYPE.helper("hero")}` directly.
 *
 * Tracking rule of thumb: the bigger the text, the tighter. Display
 * sizes use -0.025 to -0.04em; body/caption hover around -0.005em.
 *
 * Weight rule: NEVER 700 on display. 500 or 600. 700 is reserved for
 * the tabular monospaced number column when emphasis is needed.
 */
export const APPLE_TYPE = {
  display: {
    /** Largest hero treatment — only for the single most important moment in a section. */
    xxl: {
      size: 168,
      weight: 600,
      letterSpacing: "-0.04em",
      lineHeight: 1.0,
    },
    /** Default hero. Closing-line / "This is ClaimIt." territory. */
    xl: {
      size: 128,
      weight: 600,
      letterSpacing: "-0.035em",
      lineHeight: 1.06,
    },
    /** Statement type for ② Hook / ③ Why / ⑦ "All from day one." */
    l: {
      size: 96,
      weight: 600,
      letterSpacing: "-0.03em",
      lineHeight: 1.08,
    },
    /** Mid hero — Scale captions when above a big number. */
    m: {
      size: 64,
      weight: 600,
      letterSpacing: "-0.025em",
      lineHeight: 1.12,
    },
    /** Sub-hero — used for "Different…" stacked phrases, supporting beats. */
    s: {
      size: 48,
      weight: 500,
      letterSpacing: "-0.02em",
      lineHeight: 1.18,
    },
  },
  /** Numbers — tabular numerics. Same tracking rules; weight stays 600. */
  number: {
    xxl: { size: 200, weight: 600, letterSpacing: "-0.04em", lineHeight: 1.0 },
    xl: { size: 144, weight: 600, letterSpacing: "-0.035em", lineHeight: 1.0 },
    l: { size: 112, weight: 600, letterSpacing: "-0.03em", lineHeight: 1.0 },
    m: { size: 88, weight: 600, letterSpacing: "-0.025em", lineHeight: 1.0 },
    s: { size: 64, weight: 600, letterSpacing: "-0.02em", lineHeight: 1.0 },
  },
  /** Caption and supporting text — comfortable to read. */
  body: {
    l: { size: 28, weight: 500, letterSpacing: "-0.008em", lineHeight: 1.4 },
    m: { size: 22, weight: 500, letterSpacing: "-0.005em", lineHeight: 1.45 },
    s: { size: 18, weight: 500, letterSpacing: "-0.003em", lineHeight: 1.45 },
    xs: { size: 14, weight: 500, letterSpacing: "0", lineHeight: 1.4 },
  },
  /** Sourced/citation type — quietest, slightly looser. */
  caption: {
    m: { size: 16, weight: 400, letterSpacing: "0.01em", lineHeight: 1.4 },
    s: { size: 13, weight: 400, letterSpacing: "0.02em", lineHeight: 1.4 },
  },
  /** Helper that returns a CSSProperties-shaped object for direct spread. */
  helper(
    role:
      | "display.xxl"
      | "display.xl"
      | "display.l"
      | "display.m"
      | "display.s"
      | "number.xxl"
      | "number.xl"
      | "number.l"
      | "number.m"
      | "number.s"
      | "body.l"
      | "body.m"
      | "body.s"
      | "body.xs"
      | "caption.m"
      | "caption.s",
  ) {
    const [bucket, key] = role.split(".") as ["display" | "number" | "body" | "caption", string];
    const spec = (
      this[bucket] as Record<
        string,
        { size: number; weight: number; letterSpacing: string; lineHeight: number }
      >
    )[key];
    return {
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fontSize: spec.size,
      fontWeight: spec.weight,
      letterSpacing: spec.letterSpacing,
      lineHeight: spec.lineHeight,
      fontVariantNumeric: bucket === "number" ? ("tabular-nums" as const) : undefined,
      textRendering: "geometricPrecision" as const,
      WebkitFontSmoothing: "antialiased" as const,
    };
  },
} as const;

// Type roles (STORYBOARD §Visual system → Type scale) — preserved for
// backwards-compat with sections that already route through it.
// Values are px at 1920×1080. Unitless line-heights.
export const TYPE = {
  hero: { size: 112, lineHeight: 1.04, letterSpacing: "-0.022em", weight: 600 },
  number: { size: 168, lineHeight: 1.0, letterSpacing: "-0.03em", weight: 700 },
  statement: { size: 72, lineHeight: 1.12, letterSpacing: "-0.015em", weight: 500 },
  subHero: { size: 56, lineHeight: 1.15, letterSpacing: "-0.012em", weight: 500 },
  bodyLarge: { size: 36, lineHeight: 1.35, letterSpacing: "-0.005em", weight: 500 },
  body: { size: 28, lineHeight: 1.4, letterSpacing: "-0.003em", weight: 400 },
  caption: { size: 20, lineHeight: 1.3, letterSpacing: "0", weight: 400 },
  mono: { size: 24, lineHeight: 1.3, letterSpacing: "0", weight: 500 },
  subCaption: { size: 16, lineHeight: 1.3, letterSpacing: "0.01em", weight: 500 },
} as const;

// Subtitle styling — STORYBOARD says Inter Display 36px / weight 500,
// 95% opacity, y=880, no plate.
export const SUBTITLE = {
  size: 36,
  weight: 500,
  letterSpacing: "-0.005em",
  opacity: 0.95,
  y: 880,
} as const;

// Easing curves — cinematic feel. Use these instead of linear.
export const EASING = {
  // "Smooth as glass" — STORYBOARD's preferred entrance
  smooth: [0.16, 1, 0.3, 1],
  // Anticipation + slight overshoot — emphasis moments
  anticipate: [0.34, 1.56, 0.64, 1],
  // Even ease-in-out — camera dollies, slow holds
  inOut: [0.4, 0, 0.2, 1],
  // Power3.out equivalent
  power3Out: [0.215, 0.61, 0.355, 1],
  // expo.out equivalent
  expoOut: [0.16, 1, 0.3, 1],
  // expo.in equivalent
  expoIn: [0.7, 0, 0.84, 0],
} as const;

// Spring config baseline (Pillar 5 — Motion Craft)
export const SPRING = {
  damping: 16,
  mass: 1,
  stiffness: 110,
} as const;

// Shadow stacks — Pillar 2 (Depth). NEVER a single shadow.
export const SHADOW = {
  card: [
    "0 2px 4px rgba(15, 23, 42, 0.04)",
    "0 8px 16px rgba(15, 23, 42, 0.06)",
    "0 24px 48px rgba(15, 23, 42, 0.08)",
  ].join(", "),
  hero: [
    "0 2px 4px rgba(15, 23, 42, 0.04)",
    "0 8px 16px rgba(15, 23, 42, 0.06)",
    "0 24px 48px rgba(15, 23, 42, 0.08)",
    "0 56px 96px rgba(15, 23, 42, 0.04)",
  ].join(", "),
  cardOnDark: [
    "0 2px 4px rgba(0, 0, 0, 0.4)",
    "0 8px 16px rgba(0, 0, 0, 0.5)",
    "0 24px 48px rgba(0, 0, 0, 0.6)",
  ].join(", "),
  rimLight: "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 24px rgba(255,255,255,0.04)",
} as const;
