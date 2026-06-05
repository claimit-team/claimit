/**
 * Tests for the proactive-templates platform-sniffer (BUG-115 Fix A).
 * Confirms the new `data.merchant` fallback works and that
 * platform-missing payloads omit the platform clause cleanly instead
 * of rendering the literal "unknown" string.
 *
 * Vitest runs in `environment: "node"` per apps/web/vitest.config.ts,
 * so we test the pure `generateProactiveOutput` function directly
 * without rendering the card.
 */

import { describe, expect, it } from "vitest";

import { generateProactiveOutput } from "./proactive-templates";

// Helper — assert a string contains a substring; surface a clearer
// failure message than `expect(s).toMatch(/.../)` for plain literals.
function expectIncludes(haystack: string, needle: string): void {
  expect(haystack).toEqual(expect.stringContaining(needle));
}

// ---------------------------------------------------------------------------
// price_dropped
// ---------------------------------------------------------------------------

describe("priceDropped — platform-sniffer", () => {
  it("uses data.platform when present", () => {
    const out = generateProactiveOutput("price_dropped", {
      platform: "best_buy",
      refund_amount: 50,
      window_remaining_hours: 24,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your Best Buy item");
    expect(out!.key_facts).toContain("Platform: Best Buy");
  });

  it("falls back to data.merchant when platform is missing", () => {
    const out = generateProactiveOutput("price_dropped", {
      merchant: "target",
      refund_amount: 50,
      window_remaining_hours: 24,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your Target item");
    expect(out!.key_facts).toContain("Platform: Target");
  });

  it("omits the platform clause when neither key is present", () => {
    const out = generateProactiveOutput("price_dropped", {
      refund_amount: 50,
      window_remaining_hours: 24,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your item just dropped");
    expect(out!.opening_message).not.toContain("unknown");
    expect(out!.opening_message).not.toContain("Your  item"); // double-space sanity
    expect(out!.key_facts.some((f) => f.startsWith("Platform:"))).toBe(false);
  });

  it("prefers data.platform when both keys are present", () => {
    const out = generateProactiveOutput("price_dropped", {
      platform: "best_buy",
      merchant: "target",
      refund_amount: 50,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your Best Buy item");
    expect(out!.key_facts).toContain("Platform: Best Buy");
  });
});

// ---------------------------------------------------------------------------
// claim_drafted
// ---------------------------------------------------------------------------

describe("claimDrafted — platform-sniffer", () => {
  it("uses data.platform when present", () => {
    const out = generateProactiveOutput("claim_drafted", {
      platform: "amazon",
      refund_amount: 25,
      claim_type: "email",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "I drafted your Amazon email");
    expect(out!.key_facts).toContain("Platform: Amazon");
  });

  it("falls back to data.merchant when platform is missing (BUG-115 finding 3a)", () => {
    const out = generateProactiveOutput("claim_drafted", {
      merchant: "best_buy",
      refund_amount: 25,
      claim_type: "email",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "I drafted your Best Buy email");
    expect(out!.key_facts).toContain("Platform: Best Buy");
  });

  it("omits the platform clause when neither key is present", () => {
    const out = generateProactiveOutput("claim_drafted", {
      refund_amount: 25,
      claim_type: "email",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "I drafted your email");
    expect(out!.opening_message).not.toContain("unknown");
    expect(out!.key_facts.some((f) => f.startsWith("Platform:"))).toBe(false);
  });

  it("prefers data.platform when both keys are present", () => {
    const out = generateProactiveOutput("claim_drafted", {
      platform: "amazon",
      merchant: "target",
      refund_amount: 25,
      claim_type: "email",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "I drafted your Amazon email");
  });
});

// ---------------------------------------------------------------------------
// claim_submitted
// ---------------------------------------------------------------------------

describe("claimSubmitted — platform-sniffer", () => {
  it("uses data.platform when present", () => {
    const out = generateProactiveOutput("claim_submitted", { platform: "hilton" });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your Hilton claim has been submitted");
    expect(out!.key_facts).toContain("Platform: Hilton");
  });

  it("falls back to data.merchant", () => {
    const out = generateProactiveOutput("claim_submitted", { merchant: "amazon" });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your Amazon claim has been submitted");
    expect(out!.key_facts).toContain("Platform: Amazon");
  });

  it("omits platform clause when neither key is present", () => {
    const out = generateProactiveOutput("claim_submitted", {});
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your claim has been submitted");
    expect(out!.opening_message).not.toContain("unknown");
    expect(out!.key_facts).toEqual(["Status: submitted"]);
  });

  it("prefers data.platform when both keys are present", () => {
    const out = generateProactiveOutput("claim_submitted", {
      platform: "hilton",
      merchant: "amazon",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your Hilton claim has been submitted");
  });
});

// ---------------------------------------------------------------------------
// claim_denied
// ---------------------------------------------------------------------------

describe("claimDenied — platform-sniffer", () => {
  it("uses data.platform when present", () => {
    const out = generateProactiveOutput("claim_denied", {
      platform: "delta",
      denial_reason_extracted: "basic_economy",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Delta denied your claim");
    expect(out!.key_facts).toContain("Platform: Delta");
  });

  it("falls back to data.merchant", () => {
    const out = generateProactiveOutput("claim_denied", {
      merchant: "united",
      denial_reason_extracted: "window_expired",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "United Airlines denied your claim");
    expect(out!.key_facts).toContain("Platform: United Airlines");
  });

  it("omits platform clause when neither key is present (no 'unknown denied your claim')", () => {
    const out = generateProactiveOutput("claim_denied", {
      denial_reason_extracted: "other",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Your claim was denied");
    expect(out!.opening_message).not.toContain("unknown");
    expect(out!.key_facts.some((f) => f.startsWith("Platform:"))).toBe(false);
  });

  it("prefers data.platform when both keys are present", () => {
    const out = generateProactiveOutput("claim_denied", {
      platform: "delta",
      merchant: "united",
      denial_reason_extracted: "basic_economy",
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "Delta denied your claim");
  });
});

// ---------------------------------------------------------------------------
// claim_resolved_success
// ---------------------------------------------------------------------------

describe("claimResolvedSuccess — platform-sniffer", () => {
  it("uses data.platform when present", () => {
    const out = generateProactiveOutput("claim_resolved_success", {
      platform: "best_buy",
      refund_amount: 75,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "back from Best Buy");
    expect(out!.key_facts).toContain("Platform: Best Buy");
  });

  it("falls back to data.merchant", () => {
    const out = generateProactiveOutput("claim_resolved_success", {
      merchant: "target",
      refund_amount: 75,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "back from Target");
    expect(out!.key_facts).toContain("Platform: Target");
  });

  it("omits 'from <platform>' when neither key is present", () => {
    const out = generateProactiveOutput("claim_resolved_success", {
      refund_amount: 75,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "🎉 You got $75.00 back!");
    expect(out!.opening_message).not.toContain("unknown");
    expect(out!.opening_message).not.toContain(" from ");
    expect(out!.key_facts.some((f) => f.startsWith("Platform:"))).toBe(false);
    // Refund fact still surfaces
    expect(out!.key_facts).toContain("Refund: $75.00");
  });

  it("prefers data.platform when both keys are present", () => {
    const out = generateProactiveOutput("claim_resolved_success", {
      platform: "best_buy",
      merchant: "target",
      refund_amount: 75,
    });
    expect(out).not.toBeNull();
    expectIncludes(out!.opening_message, "back from Best Buy");
  });
});
