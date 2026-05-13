/**
 * Coherent demo state for settings routes (replaced by Identity Platform in 5.2).
 */
export const mockUser: {
  displayName: string;
  email: string;
  initials: string;
} = {
  displayName: "Erdun",
  email: "erdun@claimit.app",
  initials: "E",
};

export const mockGmail: {
  connected: boolean;
  connectedEmail: string;
  scopes: readonly ["gmail.readonly", "gmail.send"];
} = {
  connected: true,
  connectedEmail: "erdun@gmail.com",
  scopes: ["gmail.readonly", "gmail.send"],
};

export const mockPreferences: { defaultSendMode: "approval" | "auto" } = {
  defaultSendMode: "approval",
};

export const mockPlan: "free" | "pro" | "family" = "pro";
