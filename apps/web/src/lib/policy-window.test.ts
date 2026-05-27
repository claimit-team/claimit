import { describe, expect, it } from "vitest";

import {
  computeWindowDays,
  DEFAULT_CLAIM_WINDOW_DAYS,
  isOutsideWindow,
  type PolicyWindowDoc,
} from "./policy-window";

const BEST_BUY: PolicyWindowDoc = {
  platform: "best_buy",
  window_days: 15,
  window_days_member: 30,
};

const AMAZON: PolicyWindowDoc = {
  platform: "amazon",
  window_days: 0,
  window_days_member: null,
};

const NO_MEMBER_TIER: PolicyWindowDoc = {
  platform: "target",
  window_days: 14,
  window_days_member: null,
};

describe("computeWindowDays", () => {
  it("falls back to the default when policy is null", () => {
    expect(computeWindowDays(null, null)).toBe(DEFAULT_CLAIM_WINDOW_DAYS);
    expect(computeWindowDays(null, "Plus")).toBe(DEFAULT_CLAIM_WINDOW_DAYS);
  });

  it("honors window_days === 0 (Amazon) — does NOT collapse to default", () => {
    expect(computeWindowDays(AMAZON, null)).toBe(0);
    expect(computeWindowDays(AMAZON, "Prime")).toBe(0);
  });

  it("picks window_days_member when member tier is set AND member window exists", () => {
    expect(computeWindowDays(BEST_BUY, "My Best Buy Plus")).toBe(30);
  });

  it("falls back to window_days when window_days_member is null even with a tier set", () => {
    expect(computeWindowDays(NO_MEMBER_TIER, "RedCard")).toBe(14);
  });

  it("falls back to window_days when no member tier", () => {
    expect(computeWindowDays(BEST_BUY, null)).toBe(15);
    expect(computeWindowDays(BEST_BUY, "")).toBe(15);
  });
});

describe("isOutsideWindow", () => {
  const NOW = new Date("2026-05-27T10:00:00Z");

  it("flags a 2011 receipt against a 15-day window as outside", () => {
    const result = isOutsideWindow({
      purchaseDate: new Date("2011-01-24T00:00:00Z"),
      policy: BEST_BUY,
      memberTier: null,
      now: NOW,
    });
    expect(result.outside).toBe(true);
    expect(result.windowDays).toBe(15);
    expect(result.daysPast).toBeGreaterThan(5000);
  });

  it("treats a today-minus-3 receipt as inside a 15-day window", () => {
    const purchaseDate = new Date(NOW);
    purchaseDate.setUTCDate(purchaseDate.getUTCDate() - 3);
    const result = isOutsideWindow({
      purchaseDate,
      policy: BEST_BUY,
      memberTier: null,
      now: NOW,
    });
    expect(result.outside).toBe(false);
    expect(result.daysPast).toBe(0);
  });

  it("treats any past purchase against a 0-day Amazon window as outside", () => {
    const purchaseDate = new Date(NOW);
    purchaseDate.setUTCDate(purchaseDate.getUTCDate() - 1);
    const result = isOutsideWindow({
      purchaseDate,
      policy: AMAZON,
      memberTier: null,
      now: NOW,
    });
    expect(result.outside).toBe(true);
    expect(result.windowDays).toBe(0);
  });

  it("uses the member window when a tier is set", () => {
    // 20 days ago — outside the 15-day standard window, INSIDE the 30-day member window.
    const purchaseDate = new Date(NOW);
    purchaseDate.setUTCDate(purchaseDate.getUTCDate() - 20);
    const standard = isOutsideWindow({
      purchaseDate,
      policy: BEST_BUY,
      memberTier: null,
      now: NOW,
    });
    const member = isOutsideWindow({
      purchaseDate,
      policy: BEST_BUY,
      memberTier: "My Best Buy Plus",
      now: NOW,
    });
    expect(standard.outside).toBe(true);
    expect(member.outside).toBe(false);
  });
});
