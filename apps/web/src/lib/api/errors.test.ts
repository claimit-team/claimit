import { describe, expect, it } from "vitest";

import { friendlyAuthError, friendlyMessage } from "./errors";

describe("friendlyMessage", () => {
  it("code overrides win over status", () => {
    expect(friendlyMessage(0, "network_error")).toMatch(/can't reach the server/i);
    expect(friendlyMessage(500, "unauthenticated")).toMatch(/session expired/i);
    expect(friendlyMessage(200, "not_found")).toMatch(/couldn't find/i);
    expect(friendlyMessage(0, "request_timeout")).toMatch(/took too long/i);
    expect(friendlyMessage(409, "duplicate")).toMatch(/already added this receipt/i);
  });
  it("maps by status when code is generic", () => {
    expect(friendlyMessage(401)).toMatch(/session expired/i);
    expect(friendlyMessage(403)).toMatch(/access/i);
    expect(friendlyMessage(404)).toMatch(/couldn't find/i);
    expect(friendlyMessage(408)).toMatch(/took too long/i);
    expect(friendlyMessage(409)).toMatch(/conflicts/i);
    expect(friendlyMessage(429)).toMatch(/too many/i);
    expect(friendlyMessage(422)).toMatch(/details look off/i);
    expect(friendlyMessage(503)).toMatch(/our end/i);
  });
  it("never leaks status numbers or JSON", () => {
    for (const s of [400, 401, 403, 404, 408, 409, 422, 429, 500, 503, 0]) {
      const msg = friendlyMessage(s, "request_failed");
      expect(msg).not.toMatch(/\d{3}/);
      expect(msg).not.toMatch(/[{}]/);
    }
  });
  it("falls back for unknown status", () => {
    expect(friendlyMessage(418)).toMatch(/something went wrong/i);
  });
});

describe("friendlyAuthError", () => {
  it("suppresses user-cancelled popups", () => {
    expect(friendlyAuthError("auth/popup-closed-by-user")).toBeNull();
    expect(friendlyAuthError("auth/cancelled-popup-request")).toBeNull();
  });
  it("maps network and falls back", () => {
    expect(friendlyAuthError("auth/network-request-failed")).toMatch(/can't reach the server/i);
    expect(friendlyAuthError("auth/unknown")).toMatch(/couldn't sign in/i);
    expect(friendlyAuthError(undefined)).toMatch(/couldn't sign in/i);
  });
});
