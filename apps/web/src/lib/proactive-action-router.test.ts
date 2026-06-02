/**
 * Pure-function tests for the proactive-action-router helpers
 * (BUG-115 Fix B). Vitest runs in `environment: "node"` so we just
 * exercise the narrowing logic directly — no router, no DOM.
 */

import { describe, expect, it } from "vitest";

import { extractClaimId, extractPurchaseId } from "./proactive-action-router";

describe("extractClaimId", () => {
  it("returns the id when data.claim_id is a non-empty string", () => {
    expect(extractClaimId({ claim_id: "abc-123" })).toBe("abc-123");
  });

  it("returns null when data is undefined", () => {
    expect(extractClaimId(undefined)).toBeNull();
  });

  it("returns null when data is null", () => {
    expect(extractClaimId(null)).toBeNull();
  });

  it("returns null when claim_id is absent", () => {
    expect(extractClaimId({})).toBeNull();
  });

  it("returns null when claim_id is an empty string", () => {
    expect(extractClaimId({ claim_id: "" })).toBeNull();
  });

  it("returns null when claim_id is a non-string (number)", () => {
    expect(extractClaimId({ claim_id: 42 })).toBeNull();
  });

  it("returns null when claim_id is a non-string (null)", () => {
    expect(extractClaimId({ claim_id: null })).toBeNull();
  });

  it("returns null when data is an array (not a plain object)", () => {
    // Wire payloads are JSON objects; an array slipping through must not
    // index into and silently pluck `claim_id` from some unexpected slot.
    expect(extractClaimId(["claim_id", "abc-123"])).toBeNull();
  });

  it("returns null when data is a primitive", () => {
    expect(extractClaimId("abc-123")).toBeNull();
    expect(extractClaimId(42)).toBeNull();
  });
});

describe("extractPurchaseId (regression — kept after extraction from floating-assistant.tsx)", () => {
  it("returns the id when data.purchase_id is a non-empty string", () => {
    expect(extractPurchaseId({ purchase_id: "xyz-789" })).toBe("xyz-789");
  });

  it("returns null when data is undefined", () => {
    expect(extractPurchaseId(undefined)).toBeNull();
  });

  it("returns null when purchase_id is an empty string", () => {
    expect(extractPurchaseId({ purchase_id: "" })).toBeNull();
  });

  it("returns null when purchase_id is a non-string", () => {
    expect(extractPurchaseId({ purchase_id: 42 })).toBeNull();
  });
});
