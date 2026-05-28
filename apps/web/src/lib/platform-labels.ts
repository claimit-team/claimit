import type { Platform } from "@claimit/mongodb-types";

export const PLATFORM_LABELS: Record<Platform, string> = {
  best_buy: "Best Buy",
  amazon: "Amazon",
  target: "Target",
  walmart: "Walmart",
  marriott: "Marriott",
  hilton: "Hilton",
  delta: "Delta",
  united: "United Airlines",
  american: "American Airlines",
  southwest: "Southwest",
};

export function getPlatformLabel(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const slug = raw.trim().toLowerCase();
  if (slug in PLATFORM_LABELS) {
    return PLATFORM_LABELS[slug as Platform];
  }
  // Already labeled or unknown slug — Title Case fallback
  if (!raw.includes("_")) return raw;
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
