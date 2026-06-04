// SHOT_SPEC §1.2–1.6 — single source of truth for shot colors, type,
// easings, and the floating-window geometry. All shots import from
// here; nothing imports from polish/tokens.ts (that scale belongs to
// the legacy sections work).

// §1.2 Colors
export const COLOR = {
  NAVY: "#27466E",
  NAVY_HOVER: "#1C3555",
  NAVY_50: "#F5F7FA",
  GREEN: "#1D7A3A",
  GREEN_05: "#EFF8F2",
  AMBER: "#F59E0B",
  AMBER_BG: "#FFFBEB",
  DANGER: "#D92626",
  INK: "#101318",
  BODY: "#303845",
  MUTE: "#6B7280",
  LINE: "#E2E6EB",
  HANDLE_LINE: "#E5E5E5", // resize handle inside reused shell
  N50: "#F9FAFB",
  N100: "#F0F2F5",
  WHITE: "#FFFFFF",
  DARK_BG: "#0A0A0A",
} as const;

// §1.3 Typography — display scale for OUR overlay text (not reused UI)
// Inter, font-feature-settings: "cv11","ss01"
const FONT_FAMILY = `"Inter", system-ui, -apple-system, sans-serif`;
const FONT_FEATURES = `"cv11", "ss01"`;

interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: string;
  lineHeight: number;
  fontFeatureSettings: string;
  fontVariantNumeric?: "tabular-nums";
  textRendering: "geometricPrecision";
  WebkitFontSmoothing: "antialiased";
}

const baseStyle = (
  size: number,
  weight: number,
  letterSpacingPx: number,
  lineHeight: number,
  tabular: boolean = false,
): TypeStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${letterSpacingPx}px`,
  lineHeight,
  fontFeatureSettings: FONT_FEATURES,
  ...(tabular ? { fontVariantNumeric: "tabular-nums" as const } : {}),
  textRendering: "geometricPrecision",
  WebkitFontSmoothing: "antialiased",
});

export const TYPE = {
  DISPLAY: baseStyle(88, 600, -2.6, 0.95), // tagline, hook headline
  DISPLAY_S: baseStyle(52, 600, -1.0, 1.05), // one-liner, section title
  HEADLINE: baseStyle(40, 600, -0.4, 1.1), // "Matches the actual claim process…"
  STAT: baseStyle(160, 600, -4, 1.0, true), // 57%, 7%
  MONEY: baseStyle(132, 600, -3, 1.0, true), // $50.00 hero
  SUB: baseStyle(28, 400, 0, 1.4), // sub-lines under headlines
  MICRO: baseStyle(18, 500, 0, 1.3), // card footer labels
  FOOTNOTE: { ...baseStyle(14, 400, 0, 1.3), opacity: 0.45 }, // source citation
} as const;

// §1.4 Easings — only two
// Bezier 4-tuple form (for Remotion's interpolate easing function).
export const EASE_UI_BEZIER = [0.16, 1, 0.3, 1] as const;
export const EASE_CAM_BEZIER = [0.42, 0, 0.58, 1] as const;
// CSS strings (rarely needed but kept for completeness).
export const EASE_UI_CSS = "cubic-bezier(0.16, 1, 0.30, 1)";
export const EASE_CAM_CSS = "cubic-bezier(0.42, 0, 0.58, 1)";

// Bezier-to-function for `interpolate({ easing })`.
export const easeBezier =
  ([_x1, y1, _x2, y2]: readonly [number, number, number, number]) =>
  (t: number) => {
    const it = 1 - t;
    return 3 * it * it * t * y1 + 3 * it * t * t * y2 + t * t * t;
  };
export const EASE_UI = easeBezier(EASE_UI_BEZIER);
export const EASE_CAM = easeBezier(EASE_CAM_BEZIER);

// §1.5 Floating-window geometry
export const WINDOW = {
  NATIVE_W: 1664,
  NATIVE_H: 1016,
  FIT: 0.92,
  FIT_W: 1531, // 1664 * 0.92 rounded
  FIT_H: 935, // 1016 * 0.92 rounded
  CENTER_X: 960,
  CENTER_Y: 540,
  // Bounds on the 1920×1080 canvas after FIT-scale + centering
  BOUNDS_X_MIN: 195,
  BOUNDS_X_MAX: 1726,
  BOUNDS_Y_MIN: 72,
  BOUNDS_Y_MAX: 1008,
  SHADOW: "0 24px 60px rgba(20,30,50,0.12)",
  RADIUS: 14,
} as const;

// Inner shell native dimensions (informational — the real shell measures
// its own panels). Derived from CC_AUDIT §2.2.
export const SHELL = {
  LEFT_DRAFT_W: 666,
  RIGHT_COL_W: 998,
  EVIDENCE_H: 552,
  ASSISTANT_H: 368,
  PANE_HEADER_H: 44,
  HEADER_H: 96, // ClaimHeader
  HANDLE_PX: 1,
} as const;

// §1.7 Focus presets
export const FOCUS = {
  SHARP: 1,
  DIM: 0,
  MAX_BLUR_PX: 8,
  MIN_SATURATION: 0.55,
  DIM_OPACITY: 0.15,
  RAMP_F: 24, // 400 ms @ 60 fps
} as const;

// §1.8 Lighting / grain
export const LIGHT = {
  DARK_LIGHT_CSS:
    "radial-gradient(circle 900px at 78% 18%, rgba(255,255,255,0.10) 0%, transparent 60%)",
  LIGHT_HALO_CSS:
    "radial-gradient(ellipse 1200px 700px at 50% 46%, rgba(39,70,110,0.06) 0%, transparent 70%)",
  DARK_LIGHT_DEFAULT_OPACITY: 0.07,
  GRAIN_DARK_OPACITY: 0.05,
  GRAIN_LIGHT_OPACITY: 0,
} as const;

// §1.9 Safe area
export const SAFE = {
  X_MIN: 160,
  X_MAX: 1760,
  Y_MIN: 80,
  Y_MAX: 1000,
  CENTER_X: 960,
} as const;
