/**
 * Unit tests for `resolveBackHref` — the open-redirect / path-traversal
 * security boundary that the `/confirm/:id` Back affordance funnels
 * every `?from=` query through. Tests are pure (no React tree, no
 * router stub) because the function is intentionally factored as a
 * pure string → string mapping; everything `router.push` adds on top
 * just consumes the string this function returns.
 */
import { describe, expect, it } from "vitest";

import { resolveBackHref } from "./confirm-page-header";

describe("resolveBackHref — allow-list", () => {
  it("returns /dashboard for empty / null / undefined", () => {
    expect(resolveBackHref(undefined)).toBe("/dashboard");
    expect(resolveBackHref(null)).toBe("/dashboard");
    expect(resolveBackHref("")).toBe("/dashboard");
  });

  it("passes through exact-match interior paths", () => {
    expect(resolveBackHref("/dashboard")).toBe("/dashboard");
    expect(resolveBackHref("/")).toBe("/");
    expect(resolveBackHref("/purchases")).toBe("/purchases");
  });

  it("passes through prefix-match /purchases/<id> and /purchases?…", () => {
    expect(resolveBackHref("/purchases/abc-123")).toBe("/purchases/abc-123");
    expect(resolveBackHref("/purchases?q=foo")).toBe("/purchases?q=foo");
  });

  it("falls back for unlisted interior paths", () => {
    expect(resolveBackHref("/admin")).toBe("/dashboard");
    expect(resolveBackHref("/settings/account")).toBe("/dashboard");
    expect(resolveBackHref("/upload")).toBe("/dashboard");
  });
});

describe("resolveBackHref — open-redirect defence", () => {
  it("rejects absolute URLs", () => {
    expect(resolveBackHref("https://evil.com")).toBe("/dashboard");
    expect(resolveBackHref("http://evil.com/dashboard")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(resolveBackHref("//evil.com")).toBe("/dashboard");
    expect(resolveBackHref("//evil.com/dashboard")).toBe("/dashboard");
  });

  it("rejects javascript: and data: pseudo-protocols", () => {
    expect(resolveBackHref("javascript:alert(1)")).toBe("/dashboard");
    expect(resolveBackHref("data:text/html,<script>alert(1)</script>")).toBe("/dashboard");
  });

  it("rejects paths missing the leading slash", () => {
    expect(resolveBackHref("dashboard")).toBe("/dashboard");
    expect(resolveBackHref("purchases/abc")).toBe("/dashboard");
  });
});

describe("resolveBackHref — path-traversal defence (Bugbot #166)", () => {
  // The original prefix check `startsWith("/purchases/")` accepted any
  // path that BEGAN with that string, including ones with `..` segments
  // that `router.push`'s internal `new URL(path, origin)` would collapse
  // before routing. Bugbot flagged this as bypassing the allow-list
  // intent. These tests pin the rejection so a future refactor can't
  // quietly weaken the boundary.
  it("rejects /purchases/../admin (the exact Bugbot repro)", () => {
    expect(resolveBackHref("/purchases/../admin")).toBe("/dashboard");
  });

  it("rejects any path with a .. segment, even deep", () => {
    expect(resolveBackHref("/purchases/abc/../../admin")).toBe("/dashboard");
    expect(resolveBackHref("/dashboard/../settings")).toBe("/dashboard");
    expect(resolveBackHref("/../etc/passwd")).toBe("/dashboard");
  });

  it("rejects /.. directly", () => {
    expect(resolveBackHref("/..")).toBe("/dashboard");
    expect(resolveBackHref("/../")).toBe("/dashboard");
  });

  it("does NOT reject paths whose segments only contain '..' as a substring", () => {
    // `..foo` and `foo..` are not traversal segments — only a literal
    // `..` between `/` separators triggers the URL parser's
    // parent-directory collapse. Don't over-reject.
    expect(resolveBackHref("/purchases?q=..foo")).toBe("/purchases?q=..foo");
  });
});
