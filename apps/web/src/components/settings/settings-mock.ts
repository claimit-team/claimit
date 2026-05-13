/**
 * Coherent demo state for settings routes (replaced by Identity Platform in 5.2).
 */
export const mockUser = {
  displayName: "Erdun",
  email: "erdun@claimit.app",
  initials: "E",
} as const;

export const mockGmail = {
  connected: true,
  connectedEmail: "erdun@gmail.com",
  /** Only scopes we request in the product spec — do not add gmail.modify in mock UI. */
  scopes: ["gmail.readonly", "gmail.send"] as const,
} as const;

export const mockPreferences = {
  defaultSendMode: "approval" as "approval" | "auto",
} as const;

export const mockPlan = "pro" as "free" | "pro" | "family";
