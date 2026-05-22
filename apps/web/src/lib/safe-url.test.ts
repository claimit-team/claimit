import { describe, expect, it } from "vitest";

import { toSafeExternalHref } from "./safe-url";

describe("toSafeExternalHref", () => {
  it("returns null for nullish or empty inputs", () => {
    expect(toSafeExternalHref(null)).toBeNull();
    expect(toSafeExternalHref(undefined)).toBeNull();
    expect(toSafeExternalHref("")).toBeNull();
  });

  it("returns the value for http(s) URLs", () => {
    expect(toSafeExternalHref("http://example.com")).toBe("http://example.com");
    expect(toSafeExternalHref("https://example.com/path?q=1#hash")).toBe(
      "https://example.com/path?q=1#hash",
    );
  });

  it("returns null for non-http(s) schemes (javascript:, data:, …)", () => {
    expect(toSafeExternalHref("javascript:alert(1)")).toBeNull();
    expect(toSafeExternalHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(toSafeExternalHref("ftp://example.com")).toBeNull();
    expect(toSafeExternalHref("file:///etc/passwd")).toBeNull();
    expect(toSafeExternalHref("vbscript:msgbox(1)")).toBeNull();
  });

  it("returns null for unparseable strings (relative paths, garbage)", () => {
    expect(toSafeExternalHref("/relative/path")).toBeNull();
    expect(toSafeExternalHref("not a url")).toBeNull();
    expect(toSafeExternalHref("example.com")).toBeNull();
  });

  it("normalises case-insensitive scheme matching via URL parser", () => {
    expect(toSafeExternalHref("HTTPS://example.com")).toBe("HTTPS://example.com");
    expect(toSafeExternalHref("HTTP://example.com")).toBe("HTTP://example.com");
  });
});
