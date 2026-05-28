// Display labels keyed by platform/brand slug. Decoupled from the
// canonical `Platform` enum so we can carry forward-looking brand
// overrides (acronyms, apostrophes, intra-word casing) for slugs the
// backend may add later without widening the enum across the stack.
// Keep alphabetized.
export const PLATFORM_LABELS: Record<string, string> = {
  alaska: "Alaska Airlines",
  amazon: "Amazon",
  american: "American Airlines",
  best_buy: "Best Buy",
  delta: "Delta",
  dicks_sporting_goods: "Dick's Sporting Goods",
  hilton: "Hilton",
  home_depot: "Home Depot",
  ihg: "IHG",
  jcpenney: "JCPenney",
  jetblue: "JetBlue",
  lowes: "Lowe's",
  macys: "Macy's",
  marriott: "Marriott",
  southwest: "Southwest",
  target: "Target",
  united: "United Airlines",
  walmart: "Walmart",
};

export function getPlatformLabel(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const slug = raw.trim().toLowerCase();
  if (slug in PLATFORM_LABELS) {
    return PLATFORM_LABELS[slug];
  }
  // Already labeled or unknown slug — Title Case fallback
  if (!raw.includes("_")) return raw;
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
