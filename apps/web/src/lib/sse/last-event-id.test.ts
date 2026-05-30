import { describe, expect, it } from "vitest";

import { buildStreamUrl } from "@/lib/sse/last-event-id";

const BASE = "https://api.example.com";
const TOKEN = "tok-123";

describe("buildStreamUrl", () => {
  it("omits last_event_id on the first connection", () => {
    expect(buildStreamUrl(BASE, TOKEN)).toBe(
      "https://api.example.com/api/v1/events/stream?token=tok-123",
    );
    expect(buildStreamUrl(BASE, TOKEN, null)).not.toContain("last_event_id");
    expect(buildStreamUrl(BASE, TOKEN, "")).not.toContain("last_event_id");
  });

  it("appends an encoded last_event_id on reconnect", () => {
    const id = "2026-05-18T10:00:00+00:00|40000000-0000-0000-0000-000000000001";
    const url = buildStreamUrl(BASE, TOKEN, id);
    expect(url).toContain("&last_event_id=");
    // The `+` and `:` in the composite id must be percent-encoded so they
    // survive as query data rather than being read as a space / delimiter.
    expect(url).toContain(encodeURIComponent(id));
    expect(url).not.toContain("10:00:00+00:00|");
  });

  it("encodes the token too", () => {
    expect(buildStreamUrl(BASE, "a b/c", null)).toContain(`token=${encodeURIComponent("a b/c")}`);
  });
});
