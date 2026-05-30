import { PLATFORM_LABELS } from "@/lib/platform-labels";

/**
 * Local brand SVG files under /public/platformlogo/. Keys are the
 * display label OR backend slug; values are the basename of the SVG
 * file (without extension).
 */
const LOCAL_LOGO_SLUGS: Record<string, string> = {
  // Retail (file names match backend slugs from PLATFORM_LABELS)
  Walmart: "walmart",
  Amazon: "amazon",
  "Best Buy": "best_buy",
  Target: "target",
  Costco: "costco",
  "Home Depot": "home_depot",
  "Lowe's": "lowes",
  "Macy's": "macys",
  Nordstrom: "nordstrom",
  "Dick's Sporting Goods": "dicks",
  JCPenney: "jcpenney",
  Newegg: "newegg",
  Staples: "staples",
  Crutchfield: "crutchfield",
  Dell: "dell",

  // Hotels
  Marriott: "marriott",
  Hilton: "hilton",
  Hyatt: "hyatt",
  IHG: "ihg",
  Wyndham: "wyndham",

  // Airlines
  "United Airlines": "united",
  United: "united",
  "Delta Air Lines": "delta",
  Delta: "delta",
  "American Airlines": "american",
  "Southwest Airlines": "southwest",
  Southwest: "southwest",
  "Alaska Airlines": "alaska",
  Alaska: "alaska",
  JetBlue: "jetblue",
};

/**
 * Simple Icons CDN slugs — fallback for platforms NOT in LOCAL_LOGO_SLUGS.
 * The CDN returns brand-tinted SVG. Keep this list short — only platforms
 * with no local file but commonly seen.
 */
const SIMPLE_ICONS_SLUGS: Record<string, string> = {
  Apple: "apple",
  Google: "google",
  Microsoft: "microsoft",
};

// Mirror backend slugs (best_buy, home_depot, etc.) so callers can pass
// either display label or raw API slug.
for (const [slug, label] of Object.entries(PLATFORM_LABELS)) {
  const localMatch = LOCAL_LOGO_SLUGS[label];
  if (localMatch && !(slug in LOCAL_LOGO_SLUGS)) {
    LOCAL_LOGO_SLUGS[slug] = localMatch;
  }
  const cdnMatch = SIMPLE_ICONS_SLUGS[label];
  if (cdnMatch && !(slug in SIMPLE_ICONS_SLUGS)) {
    SIMPLE_ICONS_SLUGS[slug] = cdnMatch;
  }
}

const SIMPLE_ICONS_CDN = "https://cdn.simpleicons.org";

/**
 * Returns the ordered list of logo source URLs to try for a given
 * platform name. Empty array means no logo source is known — caller
 * should render the fallback icon directly.
 */
export function getPlatformLogoSources(platform: string | undefined | null): string[] {
  if (!platform) return [];
  const trimmed = platform.trim();
  if (!trimmed) return [];

  const sources: string[] = [];
  const local = LOCAL_LOGO_SLUGS[trimmed];
  if (local) sources.push(`/platformlogo/${local}.svg`);
  const cdn = SIMPLE_ICONS_SLUGS[trimmed];
  if (cdn) sources.push(`${SIMPLE_ICONS_CDN}/${cdn}`);
  return sources;
}
