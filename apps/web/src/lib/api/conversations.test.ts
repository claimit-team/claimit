import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONV_ID = "10000000-0000-0000-0000-000000000001";

const mockGetIdToken = vi.fn().mockResolvedValue("test-token");

vi.mock("@/lib/firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: mockGetIdToken,
    },
  },
}));

describe("conversations api client", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    mockGetIdToken.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("updateConversation sends PATCH with auth and returns conversation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          conversation: {
            _id: CONV_ID,
            user_id: "00000000-0000-0000-0000-000000000001",
            mode: "general",
            claim_id: null,
            title: "Renamed",
            messages: [],
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
            last_message_at: "2026-01-01T00:00:00Z",
            archived_at: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { updateConversation } = await import("./conversations");

    const result = await updateConversation(CONV_ID, { title: "Renamed" });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/v1/conversations/${CONV_ID}`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ title: "Renamed" }),
      }),
    );
    expect(result.title).toBe("Renamed");
  });

  it("deleteConversation sends DELETE with auth and accepts 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { deleteConversation } = await import("./conversations");

    await deleteConversation(CONV_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/v1/conversations/${CONV_ID}`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
});
